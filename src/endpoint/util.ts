import {ethers} from 'ethers'
import { logger, newCNTP_Contract, masterSetup } from '../util/util'
import rateABI from './conet-rate.json'
import Colors from 'colors/safe'
import {request as requestHttps} from 'node:https'
import EthCrypto from 'eth-crypto'
import {abi as CONET_Point_ABI} from '../util/conet-point.json'
import type {RequestOptions} from 'node:http'
import initCONETABI from './initCONET.json'
import ReferralsV3ABI from './ReferralsV3.json'
import {abi as claimableToken } from '../util/claimableToken.json'
import cCNTPv7ABI from './cCNTPv7.json'
import oldGuardianABI from '../util/CGPNs.json'
import CGPNsV4ABI from './CGPNsV4.json'
import initCONET_ABI from './initCONETABI.json'
import newCNTP_v1_ABI from './CNTP_V1.ABI.json'
import newUSDT_ABI from './newUSDT.ABI.json'
import {mapLimit} from 'async'
import {inspect} from 'node:util'

export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[0])

const rateAddr = '0xFAF1f08b66CAA3fc1561f30b496890023ea70648'.toLowerCase()

const api_endpoint = 'https://api.conet.network/api/'
const conetProvider = new ethers.JsonRpcProvider('https://rpc.conet.network')

const checkTransfer = async (tx: string, rateBack: (rate: number) => void) => {

	const rateSC = new ethers.Contract(rateAddr, rateABI, conetProvider)
	const transObj = await conetProvider.getTransaction(tx)
	const toAddr = transObj?.to?.toLowerCase()
	if (!toAddr || toAddr !== rateAddr) {
		return
	}
	
	const rate = await rateSC.rate()
	logger(Colors.grey(`rateAddr fired! [${tx}] rate = [${ethers.formatEther(rate)}]`))
	return rateBack (rate)

}

const listenRateChange = async (block: number, rateBack: (rate: number) => void) => {

	const blockInfo = await conetProvider.getBlock(block)
	const transferArray = blockInfo?.transactions
	if (! transferArray) {
		return
	}
	const execArray: any[] = []
	transferArray.forEach(n => {
		execArray.push (checkTransfer(n, rateBack))
	})
	await Promise.all([
		...execArray
	])
}

export const listeningRate = async (rateBack: (rate: number) => void) => {

	const rateSC = new ethers.Contract(rateAddr, rateABI, conetProvider)
	conetProvider.on('block', async block => {
		listenRateChange(block, rateBack)
	})
	const rate = await rateSC.rate()
	const currentBlock = await conetProvider.getBlockNumber()
	logger(Colors.grey(`startListeningCONET_Holesky_EPOCH_v2 epoch [${currentBlock}] rate = [${ethers.formatEther(rate)}]!`))
}



const startTestMiner = (url: string, POST: string,  callback: (err?: string, data?: string) => void) => {
	const Url = new URL(url)
	const option: RequestOptions = {
		hostname: Url.hostname,
		port: 443,
		method: 'POST',
		protocol: 'https:',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8'
		},
		path: Url.pathname
	}

	const kkk = requestHttps(option, res => {

		if (res.statusCode !==200) {
			setTimeout(() => {
				startTestMiner (url, POST, callback)
			}, 1000)
			
			return
		}
		let data = ''
		let _Time: NodeJS.Timeout
		res.on ('data', _data => {
			data += _data.toString()
			if (/\r\n\r\n/.test(data)) {
				clearTimeout(_Time)
				callback ('', data)
				_Time = setTimeout(() => {
					return startTestMiner (url, POST, callback)
				}, 24 * 1000)
			}
		})
		
	})

	kkk.on('error', err => {
		return startTestMiner (url, POST, callback)
	})

	kkk.once('end', () => {
		return callback('end')
	})

	kkk.end(POST)

}

export const start = (privateKeyArmor: string) => new Promise(async resolve => {
	const wallet = new ethers.Wallet(privateKeyArmor)
	const message  = JSON.stringify({walletAddress: wallet.address.toLowerCase()})
	const messageHash =  ethers.id(message)
	const signMessage = EthCrypto.sign(privateKeyArmor, messageHash)
	const sendData = {
		message, signMessage
	}

	const url = `${ api_endpoint }startMining`

	logger(Colors.green(`Start a miner! [${wallet.address}]`))

	startTestMiner(url, JSON.stringify(sendData), (err, data) => {
		setTimeout(() => {
			resolve (true)
		}, 1000)
		if (err) {
			return logger(Colors.red(err))
		}
		
	})

})

const conetOldRPC = 'http://212.227.243.233:8000'
const initCONETContractAddr = '0xc78771Fc7C371b553188859023A14Ab3AbE08807'

const referralsV3Addr ='0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const old_cUSDTAddr = '0xfE75074C273b5e33Fe268B1d5AC700d5b715DA2f'
const old_cBNBUsdtAddr = '0xAE752B49385812AF323240b26A49070bB839b10D'
const old_cUSDBAddr = '0x3258e9631ca4992F6674b114bd17c83CA30F734B'
const oldGuardianAddr = '0x453701b80324C44366B34d167D40bcE2d67D6047'

const newReffAddr= '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'

const oldCNTPAddr='0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'
const blastCNTPv1Addr = '0x53634b1285c256aE64BAd795301322E0e911153D'
const newGuardianAddr = '0x471DEbB6b3Fc0A21f91505296d64902Fb0C5e2E4'
const new_cntp = '0x5B4d548BAA7d549D030D68FD494bD20032E2bb2b'
const initCONETAddr = '0xDAFD7bb588014a7D96501A50256aa74755953c18'
const newCNTP_v1 = '0x38b1C16D6e69af20Aa5CC053fc3924ac82003596'
const new_USDT_addr = '0xc1CaB2539BbB59d45D739720942E257fF52aa708'
const new_BNBU_USDT_addr = '0xCc112a8Ec397808a4ffA0115Ad3d65ee0A8fab6c'
const new_USDB_addr = '0x37A35FFfa9cD133bB08d7359Ae7d90A6550951AA'

interface sendCONETObj {
	wallet: string
	amount: string
}



const initmanagerW_0 = new ethers.Wallet(masterSetup.initManager[0], conetProvider)
const initmanagerW_1 = new ethers.Wallet(masterSetup.initManager[1], conetProvider)
const initmanagerW_2 = new ethers.Wallet(masterSetup.initManager[2], conetProvider)
const initmanagerW_3 = new ethers.Wallet(masterSetup.initManager[3], conetProvider)
const initmanagerW_4 = new ethers.Wallet(masterSetup.initManager[4], conetProvider)
const initmanagerW_5 = new ethers.Wallet(masterSetup.initManager[5], conetProvider)
const initmanagerW_6 = new ethers.Wallet(masterSetup.initManager[6], conetProvider)
const initmanagerW_7 = new ethers.Wallet(masterSetup.initManager[7], conetProvider)

const newReferralsContract = new ethers.Contract(newReffAddr, ReferralsV3ABI, initmanagerW_1)
const GuardianNFTV4Contract = new ethers.Contract(newGuardianAddr, CGPNsV4ABI, initmanagerW_2)
const newCNTPContract = new ethers.Contract(new_cntp, cCNTPv7ABI, initmanagerW_3)
const initCONETContract = new ethers.Contract(initCONETAddr, initCONET_ABI, initmanagerW_4)
const newCNTP_V1 = new ethers.Contract(newCNTP_v1, newCNTP_v1_ABI, initmanagerW_5)
const newUSDT = new ethers.Contract(new_USDT_addr, newUSDT_ABI, initmanagerW_0)
const newUSDB = new ethers.Contract(new_BNBU_USDT_addr, newUSDT_ABI, initmanagerW_6)
const new_BNB_USDT = new ethers.Contract(new_USDB_addr, newUSDT_ABI, initmanagerW_7)

let sendCONETPool: sendCONETObj[] = []
const sendCNTPPool: Map<string, string> = new Map()
const sendCNTPv1Pool: Map<string, string> = new Map()
const refferPool: Map<string, string> = new Map()
const usdtPool: Map<string, string> = new Map()
const usdbPool: Map<string, string> = new Map()
const bnbUsdtPool: Map<string, string> = new Map()
let CGNPPool: sendCONETObj[] = []


let startCGNPPoolLock = false
const startCGNPPoolProcess = async () => {
	if (startCGNPPoolLock|| !CGNPPool.length) {
		return
	}
	startCGNPPoolLock = true
	
	const pool: Map<string, string> = new Map()
	
	CGNPPool.forEach(n => {
		pool.set(n.wallet, n.amount)
	})

	const wallets: string[] = []
	const amounts: string[] =[]

	pool.forEach((v,k) => {
		wallets.push(k)
		amounts.push(v)
	})

	mapLimit(wallets, 5, async (n, next) => {
		const balance = await GuardianNFTV4Contract.balanceOf(n, 1)
		if (balance){
			pool.delete(n)
		}
	}, async err => {

		const _wallets: string[] = []
		const _amounts: string[] = []

		pool.forEach((v,k) => {
			_wallets.push(k)
			_amounts.push(v)
		})
		try {
			await GuardianNFTV4Contract.mintNode_NFTBatch(_wallets, _amounts)
			CGNPPool = []
		} catch (ex) {
			logger(`startCGNPPool Error`, ex)
			logger(inspect(_wallets, false, 3, true))
			logger(inspect(_amounts, false, 3, true))
		}
		startCGNPPoolLock = false
	})

}



let startBnbUsdtPoolLock = false
const startBnbUsdtPool = async () => {
	if (startBnbUsdtPoolLock || !bnbUsdtPool.size) {
		return
	}
	startBnbUsdtPoolLock = true

	const [wallet] = bnbUsdtPool.keys()
	const usdbAmount = bnbUsdtPool.get(wallet)
	const hash = ethers.id(wallet)
	try {
		await new_BNB_USDT.mint(wallet, usdbAmount, hash)
		bnbUsdtPool.delete(wallet)
	} catch (ex) {
		logger(`startBnbUsdtPool Error! [${wallet}] usdbAmount ${usdbAmount} hash ${hash}`, ex)
	}

	setTimeout(() => {
		startBnbUsdtPoolLock = false
		startBnbUsdtPool ()
	}, 1000)
}

let startusdbPoolLock = false
const startusdbPool = async () => {
	if (startusdbPoolLock || !usdtPool.size) {
		return
	}
	startusdbPoolLock = true

	const [wallet] = usdbPool.keys()
	const usdbAmount = usdbPool.get(wallet)
	const hash = ethers.id(wallet)
	try {
		await newUSDB.mint(wallet, usdbAmount, hash)
		usdbPool.delete(wallet)
	} catch (ex) {
		logger(`startusdbPool Error! [${wallet}] => usdbAmount [${usdbAmount}] hash [${hash}]`, ex)
	}

	

	setTimeout(() => {
		startusdbPoolLock = false
		startusdbPool ()
	}, 1000)
}


let startUsdtPoolLock = false
const startUsdtPool = async () => {
	if (startUsdtPoolLock || !usdtPool.size) {
		return
	}
	startUsdtPoolLock = true

	const [wallet] = usdtPool.keys()
	const usdtAmount = usdtPool.get(wallet)
	const hash = ethers.id(wallet)
	try {
		await newUSDT.mint(wallet, usdtAmount, hash)
		usdtPool.delete(wallet)
	} catch (ex) {
		logger(`startUsdtPool Error! [${wallet}] => usdbAmount [${usdtAmount}] hash [${hash}]`, ex)
	}

	

	setTimeout(() => {
		startUsdtPoolLock = false
		startUsdtPool ()
	}, 1000)
}



let startRefferPoolLock = false
const startRefferPool = async () => {
	if (startRefferPoolLock || !refferPool.size) {
		return
	}
	startRefferPoolLock = true

	const [wallet] = refferPool.keys()
	const referrer = refferPool.get(wallet)
	try {
		await newReferralsContract.initAddReferrer(referrer, wallet)
		refferPool.delete(wallet)
	} catch (ex) {
		logger(`startRefferPool Error! `, ex)
	}

	

	setTimeout(() => {
		startRefferPoolLock = false
		startRefferPool ()
	}, 1000)
}

let startsendCONETPoolLock = false
const startsendCONETPool = async () => {
	if (startsendCONETPoolLock || !sendCONETPool.length ) {
		return
	}

	startsendCONETPoolLock = true
	const pool: Map<string, string> = new Map()
	
	sendCONETPool.forEach(n => {
		pool.set(n.wallet, n.amount)
	})

	const wallets: string[] = []
	const amounts: string[] =[]

	pool.forEach((v,k) => {
		wallets.push(k)
		amounts.push(v)
	})
	try{
		await initCONETContract.changeInit_batch(wallets, amounts)
		sendCONETPool = []
	} catch (ex) {
		logger(`startsendCONETPool Error`, ex)
		logger(inspect(wallets, false, 3, true))
		logger(inspect(amounts, false, 3, true))
	}
	startsendCONETPoolLock = false
}

let sendCNTPv1PoolLock = false
const startSendCNTPv1Pool = async () => {
	if (sendCNTPv1PoolLock||!sendCNTPv1Pool.size) {
		return
	}
	sendCNTPv1PoolLock = true
	const [first] = sendCNTPv1Pool.keys()
	const amount = sendCNTPv1Pool.get(first)
	try {
		await newCNTP_V1.initAccount(first, amount)
		sendCNTPv1Pool.delete(first)
	} catch (ex) {
		logger(`startSendCNTP v1 Pool Error! [${first}] => ${amount}`, ex)
	}

	

	setTimeout(() => {
		sendCNTPv1PoolLock = false
		startSendCNTPv1Pool ()
	}, 1000)
}

let sendCNTPPoolLook = false
const startSendCNTPPool = async () => {

	if (sendCNTPPoolLook||!sendCNTPPool.size) {
		return
	}

	sendCNTPPoolLook = true
	const [first] = sendCNTPPool.keys()
	const amount = sendCNTPPool.get(first)

	try {
		const initStatus = newCNTPContract.initV2(first) 
		if (!initStatus) {
			await newCNTPContract.initAccount(first, amount)
		}
		
		sendCNTPPool.delete(first)

	} catch (ex) {
		logger(`startSendCNTPPool Error! [${first}] => ${amount}`, ex)
	}
	
	setTimeout(() => {
		sendCNTPPoolLook = false
		startSendCNTPPool ()
	}, 1000)
}

export const startEposhTransfer = () => {
	conetProvider.on('block', async block => {
		startsendCONETPool()
		startSendCNTPPool()
		startSendCNTPv1Pool()
		startRefferPool()
		startUsdtPool()
		startusdbPool()
		startCGNPPoolProcess()
	})
}


export const initNewCONET: (wallet: string) =>Promise<boolean> = (wallet ) => new Promise(async resolve => {
	
	const oldProvider = new ethers.JsonRpcProvider(conetOldRPC)
	const oldGuardianContract = new ethers.Contract(oldGuardianAddr, oldGuardianABI, oldProvider)
	const oldCntpContract =new ethers.Contract(oldCNTPAddr, CONET_Point_ABI, oldProvider)
	const oldReferralsContract = new ethers.Contract(referralsV3Addr, ReferralsV3ABI, oldProvider)
	const old_cUSDB = new ethers.Contract(old_cUSDBAddr, CONET_Point_ABI, oldProvider)
	const old_cBNBUsdt = new ethers.Contract(old_cBNBUsdtAddr, CONET_Point_ABI, oldProvider)
	const old_cUSDT = new ethers.Contract(old_cUSDTAddr, CONET_Point_ABI, oldProvider)
	const blastTestnet = new ethers.JsonRpcProvider('https://blast-sepolia.blockpi.network/v1/rpc/public')
	const oldCNTPv1 = new ethers.Contract(blastCNTPv1Addr, CONET_Point_ABI, blastTestnet)


	let conetOldB = BigInt(0), cntpOldB = BigInt(0), referrer ='0x0000000000000000000000000000000000000000', newReferrer ='0x0000000000000000000000000000000000000000', USDBoldB = BigInt(0),
	 cBNBUoldB = BigInt(0), cUSDToldB = BigInt(0), cntpV1 = BigInt(0), oldGuardianNFT1 = BigInt(0), newGuardianNFT1 = BigInt(0), cCNTP_initStats = false, 
	 CONET_initStats = false, CNTP_v1_initStats = false, newUSDT_depositTx = false, 
	 newUSDB_depositTx = false, new_BNB_USDT_depositTx = false
	const walletID = ethers.id(wallet)
	
	
	try {
		[conetOldB, cntpOldB, referrer, USDBoldB, cBNBUoldB, cUSDToldB, cntpV1, oldGuardianNFT1, newGuardianNFT1, cCNTP_initStats, 
			newReferrer, 
			CONET_initStats, CNTP_v1_initStats,
			newUSDT_depositTx, newUSDB_depositTx, new_BNB_USDT_depositTx
		] = await Promise.all([
			oldProvider.getBalance(wallet),
			oldCntpContract.balanceOf(wallet),
			oldReferralsContract.getReferrer(wallet),
			old_cUSDB.balanceOf(wallet),
			old_cBNBUsdt.balanceOf(wallet),
			old_cUSDT.balanceOf(wallet),
			oldCNTPv1.balanceOf(wallet),
			oldGuardianContract.balanceOf(wallet, 1),
			GuardianNFTV4Contract.balanceOf(wallet, 1),
			newCNTPContract.initV2(wallet),
			newReferralsContract.getReferrer(wallet),
			initCONETContract.checkInit(wallet),
			newCNTP_V1.checkInit(wallet),
			newUSDT.depositTx(walletID),
			newUSDB.depositTx(walletID),
			new_BNB_USDT.depositTx(walletID)
		])
	} catch (ex) {

		logger(ex)
		return resolve (false)
	}

	logger(Colors.blue(`cCNTP_initStats [${cCNTP_initStats}]`))

	if (!CONET_initStats && conetOldB ) {

		sendCONETPool.push({
			wallet,
			amount: conetOldB.toString()
		})
	}



	if (referrer !== '0x0000000000000000000000000000000000000000' && newReferrer !== referrer) {
		refferPool.set(wallet,referrer)
	}
	
	if (cntpOldB) {
		sendCNTPPool.set(wallet, conetOldB.toString())
	}
	
	if (cntpV1 && !CNTP_v1_initStats) {
		sendCNTPv1Pool.set(wallet, cntpV1.toString())
	}

	if (cUSDToldB && !newUSDT_depositTx) {
		usdtPool.set(wallet,cUSDToldB.toString())
	}

	if (cBNBUoldB && !new_BNB_USDT_depositTx) {
		bnbUsdtPool.set(wallet,cBNBUoldB.toString())
	}

	if (USDBoldB && !newUSDB_depositTx) {
		usdbPool.set(wallet,USDBoldB.toString())
	}

	const oldG  = parseInt(oldGuardianNFT1.toString())
	const newG =  parseInt(newGuardianNFT1.toString())
	if (oldG > 1) {
		if (newG === 0) {
			CGNPPool.push({
				wallet,
				amount: oldG.toString()
			})
		}
	}

	return resolve (true)
})
