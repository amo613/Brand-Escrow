// Generate Algorand TestNet accounts and write the secrets into .env (git-ignored).
// Run once: `node scripts/gen-accounts.mjs`. TESTNET ONLY — never use these on mainnet.
import algosdk from "algosdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const envPath = new URL("../.env", import.meta.url);

function gen() {
  const a = algosdk.generateAccount();
  return {
    addr: a.addr.toString(),
    mnemonic: algosdk.secretKeyToMnemonic(a.sk),
    skB64: Buffer.from(a.sk).toString("base64"),
  };
}

const accts = {
  OWNER: gen(),       // YOUR wallet — also contract admin / deployer / dispute arbiter / treasury
  AGENT: gen(),       // AI verify-agent oracle signer (can only attest verdicts)
  DISPENSER: gen(),   // funds new users with test ALGO + USDC
  BRAND_TEST: gen(),  // e2e test actor — brand
  CREATOR_TEST: gen(),// e2e test actor — creator
};

let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
function setVar(name, val) {
  const re = new RegExp(`^${name}=.*$`, "m");
  if (re.test(env)) env = env.replace(re, `${name}=${val}`);
  else env += (env.endsWith("\n") ? "" : "\n") + `${name}=${val}\n`;
}
// backend signers
setVar("ADMIN_MNEMONIC", `"${accts.OWNER.mnemonic}"`);
setVar("AGENT_MNEMONIC", `"${accts.AGENT.mnemonic}"`);
setVar("DISPENSER_MNEMONIC", `"${accts.DISPENSER.mnemonic}"`);
setVar("PLATFORM_TREASURY_ADDR", accts.OWNER.addr);
// addresses (non-secret, handy for scripts/UI)
setVar("OWNER_ADDR", accts.OWNER.addr);
setVar("AGENT_ORACLE_ADDR", accts.AGENT.addr);
setVar("DISPENSER_ADDR", accts.DISPENSER.addr);
setVar("NEXT_PUBLIC_ADMIN_ADDR", accts.OWNER.addr);
// e2e test actors
setVar("BRAND_TEST_MNEMONIC", `"${accts.BRAND_TEST.mnemonic}"`);
setVar("CREATOR_TEST_MNEMONIC", `"${accts.CREATOR_TEST.mnemonic}"`);
setVar("BRAND_TEST_ADDR", accts.BRAND_TEST.addr);
setVar("CREATOR_TEST_ADDR", accts.CREATOR_TEST.addr);
writeFileSync(envPath, env);

const line = "─".repeat(72);
console.log(`\n${line}\n  ALGORAND TESTNET ACCOUNTS GENERATED  (written to .env, git-ignored)\n${line}`);
console.log(`\n  ★ YOUR WALLET (import the mnemonic into Pera / Defly / Lute):`);
console.log(`     Address : ${accts.OWNER.addr}`);
console.log(`     Mnemonic: ${accts.OWNER.mnemonic}`);
console.log(`     PrivKey : ${accts.OWNER.skB64}  (base64)`);
console.log(`\n  Backend accounts (secrets in .env):`);
console.log(`     AGENT_ORACLE : ${accts.AGENT.addr}`);
console.log(`     DISPENSER    : ${accts.DISPENSER.addr}`);
console.log(`\n  E2E test actors (secrets in .env):`);
console.log(`     BRAND_TEST   : ${accts.BRAND_TEST.addr}`);
console.log(`     CREATOR_TEST : ${accts.CREATOR_TEST.addr}`);
console.log(`\n  NEXT: fund YOUR WALLET with test ALGO + USDC, then it funds the rest.`);
console.log(`     ALGO : https://bank.testnet.algorand.network  (paste ${accts.OWNER.addr})`);
console.log(`     USDC : https://faucet.circle.com  (select Algorand Testnet)`);
console.log(`     Explorer: https://lora.algokit.io/testnet/account/${accts.OWNER.addr}`);
console.log(`${line}\n`);
