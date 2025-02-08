import {sendGuardianNodesContract, conet_cancun_rpc, masterSetup, checkTx, getNetworkName, logger, checkReferralsV2_OnCONET_Holesky, returnGuardianPlanReferral, CONET_guardian_purchase_Receiving_Address, checkSign, getAssetERC20Address, checkErc20Tx} from './util'
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

// tryfaucet('0xE28E5b7F232654334437A75139Ea3c161aB3ba7A')