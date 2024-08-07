import {sendClaimableAsset, masterSetup, realToClaimableContractAddress, checkClaimeToeknbalance, logger, checkValueOfGuardianPlan, checkReferralsV2_OnCONET_Holesky, returnGuardianPlanReferral, } from './util'
import {inspect} from 'node:util'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
const kk = {
    "message": "{\"walletAddress\":\"0x81bd23e001b9f7beb65fdbaca24787e3f04763a9\",\"data\":{\"receiptTx\":\"0x63765d5b1b6fe1624fd6efaa3d89464707b482ab7ddc8eab319bae7be7bb4d08\",\"publishKeys\":[\"0x17231e8f5bBA0003f6250C73d7CDdd6f30dE3606\"],\"nodes\":1,\"tokenName\":\"wusdt\",\"network\":\"BSC\",\"amount\":\"1250000000000000000000\"}}",
    "signMessage": "0xe766cc2e8d40a23868303a2fdeaa2d72adf778a0d49730d15c3650fc469d33b533e59753c1fa5694828823be45cdf2bec4415e13edf13bac5b36e36c25e004681c"
}
const testClaimable = async () => {
	const wallet = '0xB7d55C719A06a4Bc8515EF05a3F9dfe741C77704'
	const amount = '2375'
	const token = 'wusdt'
	const retClaimableContractAddress = realToClaimableContractAddress(token)
	const tx = await sendClaimableAsset(masterSetup.conetFaucetAdmin[0], retClaimableContractAddress, wallet, amount)
	logger(inspect(tx, false, 3, true))
}

const testCheckClaimeToeknbalance = async () => {
	const wallet = '0x81bd23e001b9f7beb65fdbaca24787e3f04763a9'
	await checkClaimeToeknbalance(wallet, 'cBNBUSDT')
}


