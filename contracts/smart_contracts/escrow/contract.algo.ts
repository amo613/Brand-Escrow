/**
 * PactPay — EscrowApp
 * Autonomous metric-milestone brand↔creator escrow on Algorand.
 *
 * The AI agent only ATTESTS (submitMilestoneVerdict). The contract ENFORCES every
 * money rule on-chain: recipient/amount bound from storage, observedValue >= threshold
 * re-checked on-chain, oracle-only attestation, timelock challenge window, per-tranche
 * replay latch, brand refund of unreached tranches after the deadline.
 *
 * deal.status:      0 FUNDED 1 ACCEPTED 2 TRACKING 3 PARTIAL 4 RELEASED 5 REFUNDED 6 DISPUTED
 * milestone.status: 0 PENDING 1 REACHED_PENDING 2 RELEASED 3 REFUNDED 4 DISPUTED
 * metric:           0 POSTED 1 LIKES 2 VIEWS 3 COMMENTS 4 SHARES 5 FOLLOWERS
 */
import {
  Contract,
  GlobalState,
  BoxMap,
  Account,
  Global,
  Txn,
  assert,
  uint64,
  abimethod,
  gtxn,
  itxn,
  clone,
} from '@algorandfoundation/algorand-typescript'
import { Address, Uint8, Uint64, DynamicArray, Struct } from '@algorandfoundation/algorand-typescript/arc4'

class DealHeader extends Struct<{
  brand: Address
  creator: Address // empty (zero) until acceptApplication binds it
  total: Uint64
  deadline: Uint64
  status: Uint8
  count: Uint8
  released: Uint8
}> {}

class Milestone extends Struct<{
  metric: Uint8
  threshold: Uint64
  amount: Uint64
  status: Uint8
  approvedAt: Uint64
}> {}

const BOX_RENT_FLOOR: uint64 = 100000 // 0.1 ALGO floor the brand must pay toward box MBR
// arc4 fixed-width ints: Uint8 (status/metric/count) + Uint64 (amounts/thresholds/timestamps)

export class EscrowApp extends Contract {
  admin = GlobalState<Account>()
  agentOracle = GlobalState<Account>()
  usdcAsa = GlobalState<uint64>()
  challengeWindow = GlobalState<uint64>()
  minConfidence = GlobalState<uint64>()

  deals = BoxMap<uint64, DealHeader>({ keyPrefix: 'd' })
  ms = BoxMap<uint64, Milestone>({ keyPrefix: 'm' })

  private msKey(dealId: uint64, index: uint64): uint64 {
    return dealId * 256 + index
  }

  @abimethod({ onCreate: 'require' })
  createApplication(agentOracle: Account, usdcAsa: uint64, challengeWindow: uint64, minConfidence: uint64): void {
    this.admin.value = Txn.sender
    this.agentOracle.value = agentOracle
    this.usdcAsa.value = usdcAsa
    this.challengeWindow.value = challengeWindow
    this.minConfidence.value = minConfidence
  }

  /** admin-only, one-time: opt the app account into the USDC ASA so it can hold escrow */
  bootstrap(): void {
    assert(Txn.sender === this.admin.value, 'admin only')
    itxn
      .assetTransfer({
        xferAsset: this.usdcAsa.value,
        assetReceiver: Global.currentApplicationAddress,
        assetAmount: 0,
        fee: 0,
      })
      .submit()
  }

  /** brand-signed, grouped with (1) USDC axfer of Σ amounts and (2) an ALGO box-rent payment */
  createDeal(
    axfer: gtxn.AssetTransferTxn,
    boxPay: gtxn.PaymentTxn,
    dealId: uint64,
    deadline: uint64,
    metrics: DynamicArray<Uint8>,
    thresholds: DynamicArray<Uint64>,
    amounts: DynamicArray<Uint64>,
  ): void {
    assert(!this.deals(dealId).exists, 'dealId already used')
    const count = metrics.length
    assert(count > 0 && count <= 8, 'count must be 1..8')
    assert(thresholds.length === count && amounts.length === count, 'array length mismatch')

    let total: uint64 = 0
    for (let i: uint64 = 0; i < count; i = i + 1) {
      const amt = amounts[i].asUint64()
      assert(amt > 0, 'amount must be > 0')
      total = total + amt
    }

    // GUARDRAIL: prove the funding actually arrived (don't trust, verify the sibling txns)
    assert(axfer.assetReceiver === Global.currentApplicationAddress, 'axfer must pay the app')
    assert(axfer.xferAsset.id === this.usdcAsa.value, 'axfer must be USDC')
    assert(axfer.assetAmount === total, 'axfer amount must equal sum of milestone amounts')
    assert(boxPay.receiver === Global.currentApplicationAddress, 'box-rent pay must go to the app')
    assert(boxPay.amount >= BOX_RENT_FLOOR, 'box rent not covered')

    this.deals(dealId).value = new DealHeader({
      brand: new Address(Txn.sender),
      creator: new Address(), // unbound (zero address) until accepted
      total: new Uint64(total),
      deadline: new Uint64(deadline),
      status: new Uint8(0),
      count: new Uint8(count),
      released: new Uint8(0),
    })

    for (let i: uint64 = 0; i < count; i = i + 1) {
      this.ms(this.msKey(dealId, i)).value = new Milestone({
        metric: new Uint8(metrics[i].asUint64()),
        threshold: new Uint64(thresholds[i].asUint64()),
        amount: new Uint64(amounts[i].asUint64()),
        status: new Uint8(0),
        approvedAt: new Uint64(0),
      })
    }
  }

  /** brand-signed: bind the chosen creator (settable once) */
  acceptApplication(dealId: uint64, creator: Account): void {
    const d = clone(this.deals(dealId).value)
    assert(Txn.sender === d.brand.native, 'brand only')
    assert(d.status.asUint64() === 0, 'deal must be FUNDED')
    this.deals(dealId).value = new DealHeader({
      brand: d.brand,
      creator: new Address(creator),
      total: d.total,
      deadline: d.deadline,
      status: new Uint8(1),
      count: d.count,
      released: d.released,
    })
  }

  /** AGENT-ORACLE ONLY: attest a verdict. The contract re-checks confidence + threshold itself. */
  submitMilestoneVerdict(dealId: uint64, index: uint64, pass: boolean, confidence: uint64, observedValue: uint64): void {
    assert(Txn.sender === this.agentOracle.value, 'oracle only')
    const k = this.msKey(dealId, index)
    const m = clone(this.ms(k).value)
    assert(m.status.asUint64() === 0, 'milestone not PENDING')
    // GUARDRAIL: only approve if the AI passed, confidence clears the floor, AND the attested
    // metric truly meets the on-chain threshold. A hallucinated low number cannot approve.
    if (pass && confidence >= this.minConfidence.value && observedValue >= m.threshold.asUint64()) {
      this.ms(k).value = new Milestone({
        metric: m.metric,
        threshold: m.threshold,
        amount: m.amount,
        status: new Uint8(1),
        approvedAt: new Uint64(Global.latestTimestamp),
      })
    }
  }

  /** permissionless: release a tranche AFTER the timelock — to the BOUND creator, the EXACT amount, once */
  releaseMilestone(dealId: uint64, index: uint64): void {
    const d = clone(this.deals(dealId).value)
    const k = this.msKey(dealId, index)
    const m = clone(this.ms(k).value)
    assert(m.status.asUint64() === 1, 'milestone not REACHED_PENDING')
    assert(d.status.asUint64() !== 6, 'deal disputed')
    assert(Global.latestTimestamp >= m.approvedAt.asUint64() + this.challengeWindow.value, 'timelock not elapsed')

    // GUARDRAIL: recipient = bound creator (from storage), amount = milestone amount (from storage)
    itxn
      .assetTransfer({
        xferAsset: this.usdcAsa.value,
        assetReceiver: d.creator.native,
        assetAmount: m.amount.asUint64(),
        fee: 0,
      })
      .submit()

    this.ms(k).value = new Milestone({
      metric: m.metric,
      threshold: m.threshold,
      amount: m.amount,
      status: new Uint8(2),
      approvedAt: m.approvedAt,
    })

    const newReleased: uint64 = d.released.asUint64() + 1
    const newStatus: uint64 = newReleased === d.count.asUint64() ? 4 : 3
    this.deals(dealId).value = new DealHeader({
      brand: d.brand,
      creator: d.creator,
      total: d.total,
      deadline: d.deadline,
      status: new Uint8(newStatus),
      count: d.count,
      released: new Uint8(newReleased),
    })
  }

  /** brand-only, within the challenge window: freeze the release for admin review */
  dispute(dealId: uint64, index: uint64): void {
    const d = clone(this.deals(dealId).value)
    assert(Txn.sender === d.brand.native, 'brand only')
    const k = this.msKey(dealId, index)
    const m = clone(this.ms(k).value)
    assert(m.status.asUint64() === 1, 'milestone not REACHED_PENDING')
    assert(Global.latestTimestamp < m.approvedAt.asUint64() + this.challengeWindow.value, 'window passed')
    this.ms(k).value = new Milestone({
      metric: m.metric,
      threshold: m.threshold,
      amount: m.amount,
      status: new Uint8(4),
      approvedAt: m.approvedAt,
    })
    this.deals(dealId).value = new DealHeader({
      brand: d.brand,
      creator: d.creator,
      total: d.total,
      deadline: d.deadline,
      status: new Uint8(6),
      count: d.count,
      released: d.released,
    })
  }

  /** admin-only: resolve a disputed tranche — pay creator OR refund brand (recipient still bound) */
  resolveDispute(dealId: uint64, index: uint64, payCreator: boolean): void {
    const d = clone(this.deals(dealId).value)
    assert(Txn.sender === this.admin.value, 'admin only')
    const k = this.msKey(dealId, index)
    const m = clone(this.ms(k).value)
    assert(m.status.asUint64() === 4, 'milestone not DISPUTED')

    const recipient: Account = payCreator ? d.creator.native : d.brand.native
    itxn
      .assetTransfer({
        xferAsset: this.usdcAsa.value,
        assetReceiver: recipient,
        assetAmount: m.amount.asUint64(),
        fee: 0,
      })
      .submit()

    const newMsStatus: uint64 = payCreator ? 2 : 3
    const newReleased: uint64 = payCreator ? d.released.asUint64() + 1 : d.released.asUint64()
    this.ms(k).value = new Milestone({
      metric: m.metric,
      threshold: m.threshold,
      amount: m.amount,
      status: new Uint8(newMsStatus),
      approvedAt: m.approvedAt,
    })
    this.deals(dealId).value = new DealHeader({
      brand: d.brand,
      creator: d.creator,
      total: d.total,
      deadline: d.deadline,
      status: new Uint8(3),
      count: d.count,
      released: new Uint8(newReleased),
    })
  }

  /** brand-only, after the deadline: refund every NON-released tranche back to the brand */
  refund(dealId: uint64): void {
    const d = clone(this.deals(dealId).value)
    assert(Txn.sender === d.brand.native, 'brand only')
    assert(Global.latestTimestamp >= d.deadline.asUint64(), 'before deadline')

    const count = d.count.asUint64()
    let refundTotal: uint64 = 0
    for (let i: uint64 = 0; i < count; i = i + 1) {
      const k = this.msKey(dealId, i)
      const m = clone(this.ms(k).value)
      const st = m.status.asUint64()
      if (st !== 2 && st !== 3) {
        // not RELEASED and not already REFUNDED → refund this tranche
        refundTotal = refundTotal + m.amount.asUint64()
        this.ms(k).value = new Milestone({
          metric: m.metric,
          threshold: m.threshold,
          amount: m.amount,
          status: new Uint8(3),
          approvedAt: m.approvedAt,
        })
      }
    }
    if (refundTotal > 0) {
      itxn
        .assetTransfer({
          xferAsset: this.usdcAsa.value,
          assetReceiver: d.brand.native,
          assetAmount: refundTotal,
          fee: 0,
        })
        .submit()
    }
    this.deals(dealId).value = new DealHeader({
      brand: d.brand,
      creator: d.creator,
      total: d.total,
      deadline: d.deadline,
      status: new Uint8(5),
      count: d.count,
      released: d.released,
    })
  }
}
