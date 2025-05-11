import {sendGuardianNodesContract, checkSignObj, conet_cancun_rpc, masterSetup, checkTx, getNetworkName, logger, checkReferralsV2_OnCONET_Holesky, returnGuardianPlanReferral, CONET_guardian_purchase_Receiving_Address, checkSign, getAssetERC20Address, checkErc20Tx} from './util'
import {inspect} from 'node:util'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
import assetOracle_ABI from '../endpoint/oracleAsset.ABI.json'
import CNTP_ABI from './cCNTP.json'
import faucet_v3_ABI from '../endpoint/faucet_v3.abi.json'

const provideCONET = new ethers.JsonRpcProvider(conet_cancun_rpc)
const faucetV3_new_Addr = `0x04CD419cb93FD4f70059cAeEe34f175459Ae1b6a`

const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[5], provideCONET)
const faucet_v3_Contract = new ethers.Contract(faucetV3_new_Addr, faucet_v3_ABI, faucetWallet)
const tryfaucet = async (wallet: string) => {
	logger(Colors.green(`wallet = ${faucetWallet.address}`))
	try {
		const tx = await faucet_v3_Contract.getFaucet([wallet], ['127.0.0.1'])
		logger(inspect(tx))
	} catch (ex) {
		logger(ex)
	}
}

const testCheckSign = () => {
    const kk = {"message":"{\"Securitykey\":\"pqqaZRdMT65tuwFpjW6zLw\\u003d\\u003d\",\"algorithm\":\"aes-256-cbc\",\"command\":\"SaaS_Sock5\",\"requestData\":{\"buffer\":\"\",\"host\":\"ac046a96157bb340.conet.network\",\"port\":80,\"uuid\":\"13fb52c8-0ba9-4959-872d-cfa78678ac10\"},\"walletAddress\":\"0x779cc0dda545201396daa3c7df85392471e21579\"}","signMessage":"0xdbbd2b47719f93e52a67413dcd202c900575b624cb148d516067fc4684a4cdc42bb9adf1bce99ddb1969d02677e0f4d62d8238074cb835a8716016babae59d461b"}
    const ss = checkSignObj (kk.message, kk.signMessage)
    logger(inspect(ss, false, 3, true))
}
// testCheckSign()
// tryfaucet('0xE28E5b7F232654334437A75139Ea3c161aB3ba7A')