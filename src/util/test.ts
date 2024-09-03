import {checkSignObj, masterSetup, checkTx, getNetworkName, logger, checkValueOfGuardianPlan, checkReferralsV2_OnCONET_Holesky, returnGuardianPlanReferral, CONET_guardian_Address, checkSign, getAssetERC20Address, checkErc20Tx} from './util'
import {inspect} from 'node:util'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
import cGNPv7ABI from '../endpoint/CGPNsV7.json'
const new_CGNP_addr = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'

const testSign = (sign: string, message: string) => {

	const obj = checkSign(message, sign)
	logger(inspect(obj, false, 3, true))

}
const newCONETProvider = new ethers.JsonRpcProvider('https://rpc.conet.network')

const checkUsedTx = async (tx: number) => {
	const txSC = new ethers.Contract(new_CGNP_addr, cGNPv7ABI, newCONETProvider)
	try {
		const usedTx = await txSC.credentialTx(tx)
		return usedTx
	} catch (ex) {
		return true
	}

}

export const GuardianPurchase = async (message: string, signMessage: string, ipaddress: string) => {
	const obj = checkSign (message, signMessage)

	if (!obj || !obj?.data) {
		logger (Colors.grey(`Router /Purchase-Guardian checkSignObj obj Error!`), message, signMessage)
		return false
	}

	logger(Colors.magenta(`/Purchase-Guardian from ${ipaddress}:${obj.walletAddress}`))
	logger(inspect(obj, false, 3, true))

	if (obj.data?.nodes !== obj.data?.publishKeys?.length) {
		logger(Colors.grey(`Router /Purchase-Guardian obj.data?.nodes !== obj.data?.publishKeys?.length Error!`), inspect(obj, false, 3, true))
		return false
	}

	const txObj = await checkTx (obj.data.receiptTx, obj.data.tokenName)

	if (typeof txObj === 'boolean'|| !txObj?.tx1 || !txObj?.tx) {
		logger(Colors.grey(`Router /Purchase-Guardian txObj Error!`), inspect(txObj, false, 3, true))
		return false
	}

	if (txObj.tx1.from.toLowerCase() !== obj.walletAddress) {
		logger(Colors.red(`Router /Purchase-Guardian txObj txObj.tx1.from [${txObj.tx1.from}] !== obj.walletAddress [${obj.walletAddress}]`))
		return false
	}

	const networkName = getNetworkName(obj.data.tokenName)
	if (!networkName) {
		logger(Colors.red(`Router /Purchase-Guardian Can't get network Name from token name Error ${obj.data.tokenName}`))
		return false
	}

	const CONET_receiveWallet = CONET_guardian_Address(obj.data.tokenName)
	
	const _checkTx = await checkUsedTx (obj.data.receiptTx )

	if (_checkTx) {
		logger(Colors.red(`Router /Purchase-Guardian tx [${obj.data.receiptTx}] laready used`))
		return false
	}

	logger(Colors.blue(`${message}`))
	logger(Colors.blue(`${signMessage}`))
	
	if (txObj.tx1.to?.toLowerCase() !== CONET_receiveWallet ) {
		
		if (getAssetERC20Address(obj.data.tokenName) !== txObj.tx1.to?.toLowerCase()) {
			logger(Colors.red(`Router /Purchase-Guardian ERC20 token address Error!`), inspect( txObj.tx1, false, 3, true))
			return false
		}

		const erc20Result = checkErc20Tx(txObj.tx, CONET_receiveWallet, obj.walletAddress, obj.data.amount, obj.data.nodes, obj.data.tokenName)
		if (erc20Result === false) {
			logger(Colors.red(`Router /Purchase-Guardian  checkErc20Tx Error!`))
			return false
		}
		const kk = await checkValueOfGuardianPlan(obj.data.nodes, obj.data.tokenName, obj.data.amount)
		if (!kk) {
			logger(Colors.red(`Router /Purchase-Guardian  checkValueOfGuardianPlan Error!`))
			return false
		}
		const referral = await checkReferralsV2_OnCONET_Holesky(obj.walletAddress)
		const ret = await returnGuardianPlanReferral(obj.data.nodes, referral, obj.walletAddress, obj.data.tokenName, masterSetup.conetFaucetAdmin[0], obj.data.publishKeys)
		return true
	}
	
	
	const value = txObj.tx1.value.toString()
	if (obj.data.amount !== value) {
		logger(Colors.red(`GuardianPlanPreCheck amount[${obj.data.amount}] !== tx.value [${value}] Error!`))
		return false
	}

	const kk = await checkValueOfGuardianPlan(obj.data.nodes, obj.data.tokenName, obj.data.amount)

	if (!kk) {
		logger(Colors.red(`checkValueOfGuardianPlan checkValueOfGuardianPlan has unknow tokenName [${obj.data.tokenName}] Error! ${inspect(txObj, false, 3, true)}`))
		return false
	}

	logger(Colors.red(`checkValueOfGuardianPlan non USDT obj.data.tokenName [${obj.data.tokenName}] Error! kk ${kk} ${value} ${inspect(txObj, false, 3, true)}`))
	return false
}

const arb = {
    "message": "{\"walletAddress\":\"0xcaf3618cd363a44d7a153a73b22541d1caf5af8e\",\"data\":{\"receiptTx\":\"0x8df22d6335b2da6aa2619c1f0aa8e1079ae2ecb6c35f9d7d4fa8d44514f04232\",\"publishKeys\":[\"0x170024A5A518107cD408697a2b31E3bc6981D488\"],\"nodes\":1,\"tokenName\":\"arb_usdt\",\"network\":\"ARB\",\"amount\":\"500000\"}}",
    "signMessage": "0x9ce6d6c57c7a4b28d4931742d1274bcbe2d4e9ec001ae250b0703bcae8a42a102cc9a4329de0674c478a88138ab6267d5d60eaa62da94b84bac573d6bdc4920e1c"
}

const usdt = {
    "message": "{\"walletAddress\":\"0xcaf3618cd363a44d7a153a73b22541d1caf5af8e\",\"data\":{\"receiptTx\":\"0x268ed44016c9f0fd14efcbbe0e03fad2d3fdae0e4282f753b6fef3885d709e4f\",\"publishKeys\":[\"0x170024A5A518107cD408697a2b31E3bc6981D488\"],\"nodes\":1,\"tokenName\":\"usdt\",\"network\":\"ETH\",\"amount\":\"10000\"}}",
    "signMessage": "0xacbcca15109f4868afe148d0674b922fb6d7b550ca79d23bc57e1fe33c1d62ca07658e1f63fbae1393ce1e96577c80de0989f8d05ac0c281ff712a22e259eb9e1c"
}

const wusdt = {
    "message": "{\"walletAddress\":\"0xcaf3618cd363a44d7a153a73b22541d1caf5af8e\",\"data\":{\"receiptTx\":\"0x0603f4baa5add39c2f30eab56fda9b03439745f6061af4b674244a4719719d63\",\"publishKeys\":[\"0x170024A5A518107cD408697a2b31E3bc6981D488\"],\"nodes\":1,\"tokenName\":\"wusdt\",\"network\":\"BSC\",\"amount\":\"1000000000000000000\"}}",
    "signMessage": "0x3714acb5b3e03b0a77e41e98e6944b5acad25f50b746051fa2c86a151276129c415b59175aed52c9226076c7561847f5d857a600f509d61cece6ab2c55ceaae51c"
}

GuardianPurchase(usdt.message, usdt.signMessage, '127.0.0.1')
// testSign('0xf35d72a82fe7897f6168c5168f7f47492f17232d4b0c9cf4eeaab87a94dd19ca5e8f8341dcb310ac5d208b9f8c4d09e0ab87b3ca030f5b23798314bccb1265011b',`{"walletAddress":"0xcaf3618cd363a44d7a153a73b22541d1caf5af8e"}`)
// testSign('0x4649e2167e7d5ada11e92bfeead2641ff0695d7a29bd7e13d8c158dab8570a246cff5802badd762921c6ac5618a629baac9ddc43e2ff1c08ba847b3c218337b81b',`{"walletAddress":"0xcaf3618cd363a44d7a153a73b22541d1caf5af8e"}`)