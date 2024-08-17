import {ethers} from 'ethers'
import { logger, newCNTP_Contract, masterSetup } from '../util/util'
import rateABI from './conet-rate.json'
import Colors from 'colors/safe'


import {abi as CONET_Point_ABI} from '../util/conet-point.json'

import initCONETABI from './initCONET.json'
import ReferralsV3ABI from './ReferralsV3.json'
import {abi as claimableToken } from '../util/claimableToken.json'
import cCNTPv7ABI from './cCNTPv7.json'
import oldGuardianABI from '../util/CGPNs.json'
import CGPNsV7ABI from './CGPNsV7.json'
import initCONET_ABI from './initCONETABI.json'
import newCNTP_v1_ABI from './CNTP_V1.ABI.json'
import newUSDT_ABI from './newUSDT.ABI.json'
import {mapLimit} from 'async'
import {inspect} from 'node:util'

export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[0])

const rateAddr = '0xFAF1f08b66CAA3fc1561f30b496890023ea70648'.toLowerCase()

const conetProvider = new ethers.JsonRpcProvider('https://rpc1.conet.network')

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

let EPOCH = 0
export const listeningRate = async (rateBack: (rate: number) => void) => {
	EPOCH = await conetProvider.getBlockNumber()
	const rateSC = new ethers.Contract(rateAddr, rateABI, conetProvider)

	conetProvider.on('block', async block => {
		if (block === EPOCH + 1) {
			logger(Colors.grey(`startListeningCONET_Holesky_EPOCH_v2 epoch [${EPOCH}] rate = [${ethers.formatEther(rate)}]!`))
			listenRateChange(block, rateBack)
			EPOCH ++
		}
		
	})

	const rate = await rateSC.rate()

	
}


const blastTestnet = new ethers.JsonRpcProvider('https://blast-sepolia.blockpi.network/v1/rpc/public')
const conetOldRPC = 'http://212.227.243.233:8000'
const initCONETContractAddr = '0xc78771Fc7C371b553188859023A14Ab3AbE08807'

const oldrReferralsV3Addr ='0x8f6be4704a3735024F4D2CBC5BAC3722c0C8a0BD'
const old_cUSDTAddr = '0xfE75074C273b5e33Fe268B1d5AC700d5b715DA2f'
const old_cBNBUsdtAddr = '0xAE752B49385812AF323240b26A49070bB839b10D'
const old_cUSDBAddr = '0x3258e9631ca4992F6674b114bd17c83CA30F734B'
const oldGuardianAddr = '0x453701b80324C44366B34d167D40bcE2d67D6047'

const newReffAddr= '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'

const oldCNTPAddr='0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'
const blastCNTPv1Addr = '0x53634b1285c256aE64BAd795301322E0e911153D'
const newGuardianAddr = '0xc3e210034868e8d739feE46ac5D1b1953895C87E'
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
const GuardianNFTV7Contract = new ethers.Contract(newGuardianAddr, CGPNsV7ABI, initmanagerW_2)
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
const CGNP_no1_Pool: Map<string, string> = new Map()
const CGNP_no2_Pool: Map<string, string> = new Map()

let startCGNPPool1Lock = false
const startCGNPPool_no1_Process = async () => {
	if (startCGNPPool1Lock|| !CGNP_no1_Pool.size) {
		return
	}
	startCGNPPool1Lock = true


	const wallets: string[] = []
	const amounts: string[] =[]

	CGNP_no1_Pool.forEach((v,k) => {
		wallets.push(k)
		amounts.push(v)
	})
	let iii = 0
	mapLimit(wallets, 1, async (n, next) => {
		const [status] = await GuardianNFTV7Contract.getBUYER_Status(n)

		if (!status){
			try {
				const uuu = await GuardianNFTV7Contract.mintBUYER_NFT(n, amounts[iii])
				logger(Colors.blue(`startCGNPPool_no1_Process added ${n} #1 NFT ${ amounts[iii]} success ${uuu.hash}`))
			} catch (ex) {
				logger(Colors.red(`startCGNPPool_no1_Process Error!`), ex)
			}
			
		}
		CGNP_no1_Pool.delete(n)
		iii ++
	}, async err => {
		startCGNPPool1Lock = false
		startCGNPPool_no1_Process ()
	})

}

let startCGNPPoo21Lock = false
const startCGNPPool_no2_Process = async () => {
	if (startCGNPPoo21Lock|| !CGNP_no2_Pool.size) {
		return
	}
	startCGNPPoo21Lock = true


	const wallets: string[] = []
	const amounts: string[] =[]

	CGNP_no2_Pool.forEach((v,k) => {
		wallets.push(k)
		amounts.push(v)
	})
	let iii = 0
	mapLimit(wallets, 1, async (n, next) => {
		const status = await GuardianNFTV7Contract.getREFERRER_Status(n)
		if (!status){
			try {
				const uuu = await GuardianNFTV7Contract.mintREFERRER_NFT(n, amounts[iii])
				logger(Colors.blue(`startCGNPPool_no2_Process added ${n} #2 NFT ${ amounts[iii]} success ${uuu.hash}`))
			} catch (ex) {
				logger(Colors.red(`startCGNPPool_no2_Process Error!`), ex)
			}
			
		}
		CGNP_no2_Pool.delete(n)
		iii ++
	}, async err => {
		startCGNPPoo21Lock = false
		startCGNPPool_no2_Process ()
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
	if (amount === undefined) {
		logger(`startSendCNTPPool ${first} amount undefined Error!`)
		return setTimeout(() => {
			sendCNTPPoolLook = false
			startSendCNTPPool ()
		}, 1000)
	}
	

	try {
		const initStatus = await newCNTPContract.initV2(first) 
		
		if (!initStatus) {
			const tx = await newCNTPContract.initAccount(first, amount)
			logger(`startSendCNTPPool ${first} => ${ethers.formatEther(amount)} tx [${tx.hash}]`)
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

let epoch = 0
export const startEposhTransfer = async () => {
	epoch = await conetProvider.getBlockNumber()
	logger(`startEposhTransfer epoch = ${epoch}`)
	conetProvider.on('block', async _block => {
		// if ( _block === epoch + 1) {
			startsendCONETPool()
			startSendCNTPPool()
			startSendCNTPv1Pool()
			startRefferPool()
			startUsdtPool()
			startusdbPool()
			startCGNPPool_no1_Process()
			startCGNPPool_no2_Process()
			logger(`start Eposh Init () ${_block}`)
			epoch++
		// }
		
	})
}
interface oldDatObj {
	conetOldB: BigInt
	cntpOldB: BigInt
	referrer: string
	newReferrer: string
	USDBoldB: BigInt
	cBNBUoldB: BigInt
	cUSDToldB: BigInt
	cntpV1: BigInt 
	oldGuardianNFT1: BigInt
	newGuardianNFT1_initSTatus: [boolean, BigInt], 
	oldGuardianNFT2: BigInt
	newGuardianNFT2_initSTatus: boolean
	
	cCNTP_initStats: boolean

	CONET_initStats: boolean
	CNTP_v1_initStats: boolean
	newUSDT_depositTx: boolean
	newUSDB_depositTx: boolean
	new_BNB_USDT_depositTx: boolean
	newCNTPBalance: BigInt
}
const initDataPool: Map<string, oldDatObj > = new Map()

const getAllOldData: (wallet: string) => Promise<false|oldDatObj> = (wallet: string) => new Promise ( async resolve => {

	const oldProvider = new ethers.JsonRpcProvider(conetOldRPC)
	const oldCntpContract =new ethers.Contract(oldCNTPAddr, CONET_Point_ABI, oldProvider)
	const oldReferralsContract = new ethers.Contract(oldrReferralsV3Addr, ReferralsV3ABI, oldProvider)
	const old_cUSDB = new ethers.Contract(old_cUSDBAddr, CONET_Point_ABI, oldProvider)
	const old_cBNBUsdt = new ethers.Contract(old_cBNBUsdtAddr, CONET_Point_ABI, oldProvider)
	const old_cUSDT = new ethers.Contract(old_cUSDTAddr, CONET_Point_ABI, oldProvider)
	const oldCNTPv1 = new ethers.Contract(blastCNTPv1Addr, CONET_Point_ABI, blastTestnet)
	const oldGuardianContract = new ethers.Contract(oldGuardianAddr, oldGuardianABI, oldProvider)

	let conetOldB = BigInt(0), cntpOldB = BigInt(0), referrer ='0x0000000000000000000000000000000000000000', newReferrer ='0x0000000000000000000000000000000000000000', USDBoldB = BigInt(0),
	cBNBUoldB = BigInt(0), cUSDToldB = BigInt(0), cntpV1 = BigInt(0), 
	oldGuardianNFT1 = BigInt(0), newGuardianNFT1_initSTatus = [], 
	oldGuardianNFT2 = BigInt(0), newGuardianNFT2_initSTatus = false, 
	
	cCNTP_initStats = false, 
	CONET_initStats = false, CNTP_v1_initStats = false, newUSDT_depositTx = false, 
	newUSDB_depositTx = false, new_BNB_USDT_depositTx = false,
	newCNTPBalance = BigInt(0)
   	const walletID = ethers.id(wallet)
	try {
		[
			conetOldB, cntpOldB, referrer, USDBoldB, cBNBUoldB, cUSDToldB, cntpV1, 
			oldGuardianNFT1, newGuardianNFT1_initSTatus, 
			oldGuardianNFT2, newGuardianNFT2_initSTatus, 
			cCNTP_initStats, 
			newReferrer, 
			CONET_initStats, CNTP_v1_initStats,
			newUSDT_depositTx, newUSDB_depositTx, new_BNB_USDT_depositTx,
			newCNTPBalance
		] = await Promise.all([
			oldProvider.getBalance(wallet),
			oldCntpContract.balanceOf(wallet),
			oldReferralsContract.getReferrer(wallet),
			old_cUSDB.balanceOf(wallet),
			old_cBNBUsdt.balanceOf(wallet),
			old_cUSDT.balanceOf(wallet),
			oldCNTPv1.balanceOf(wallet),
			oldGuardianContract.balanceOf(wallet, 1),
			GuardianNFTV7Contract.getBUYER_Status(wallet),
			oldGuardianContract.balanceOf(wallet, 2),
			GuardianNFTV7Contract.getREFERRER_Status (wallet),
			newCNTPContract.initV2(wallet),
			newReferralsContract.getReferrer(wallet),
			initCONETContract.checkInit(wallet),
			newCNTP_V1.checkInit(wallet),
			newUSDT.depositTx(walletID),
			newUSDB.depositTx(walletID),
			new_BNB_USDT.depositTx(walletID),
			newCNTPContract.balanceOf(wallet),
		])
		const retObj: oldDatObj = {
			conetOldB, cntpOldB, referrer, USDBoldB, cBNBUoldB, cUSDToldB, cntpV1,
			oldGuardianNFT1, newGuardianNFT1_initSTatus,
			oldGuardianNFT2, newGuardianNFT2_initSTatus, 
			cCNTP_initStats, 
			newReferrer, 
			CONET_initStats, CNTP_v1_initStats,
			newUSDT_depositTx, newUSDB_depositTx, new_BNB_USDT_depositTx,
			newCNTPBalance
		}
		return resolve(retObj)
	} catch (ex) {
		logger(ex)
		return resolve (false)
	}
})


export const initNewCONET: (wallet: string) =>Promise<boolean> = (wallet ) => new Promise(async resolve => {

	let obj = initDataPool.get(wallet)
	if (!obj) {
		const _obj = await getAllOldData(wallet)
		if (_obj === false) {
			return resolve (true)
		}

		initDataPool.set(wallet, obj = _obj)
	}
	

	logger(Colors.blue(`cCNTP_initStats ${wallet} CNTP old [${ethers.formatEther(obj.cntpOldB.toString())}] new [${ethers.formatEther(obj.newCNTPBalance.toString())}] [${obj.cCNTP_initStats}]`))

	if (!obj.CONET_initStats && obj.conetOldB ) {

		sendCONETPool.push({
			wallet,
			amount: obj.conetOldB.toString()
		})
	}



	if (obj.referrer !== '0x0000000000000000000000000000000000000000' && obj.newReferrer !== obj.referrer) {
		refferPool.set(wallet,obj.referrer)
	}
	
	if (obj.cntpOldB && !obj.cCNTP_initStats) {
		sendCNTPPool.set(wallet, obj.cntpOldB.toString())
	}
	
	if (obj.cntpV1 && !obj.CNTP_v1_initStats) {
		sendCNTPv1Pool.set(wallet, obj.cntpV1.toString())
	}

	if (obj.cUSDToldB && !obj.newUSDT_depositTx) {
		usdtPool.set(wallet,obj.cUSDToldB.toString())
	}

	if (obj.cBNBUoldB && !obj.new_BNB_USDT_depositTx) {
		bnbUsdtPool.set(wallet, obj.cBNBUoldB.toString())
	}

	if (obj.USDBoldB && !obj.newUSDB_depositTx) {
		usdbPool.set(wallet, obj.USDBoldB.toString())
	}

	const oldG1 = parseInt(obj.oldGuardianNFT1.toString())

	if (oldG1 > 0) {
		logger(Colors.blue(`${wallet} has NFT #1 asset && newGuardianNFT1_initSTatus[0] = ${obj.newGuardianNFT1_initSTatus[0]}`))
		if (!obj.newGuardianNFT1_initSTatus[0]) {
			CGNP_no1_Pool.set(wallet, obj.oldGuardianNFT1.toString())
		}
	}

	const oldG2 = parseInt(obj.oldGuardianNFT2.toString())
	if (oldG2 > 0) {
		logger(Colors.blue(`${wallet} has NFT #2 asset && newGuardianNFT1_initSTatus[0] = ${obj.newGuardianNFT1_initSTatus[0]}`))
		if (!obj.newGuardianNFT2_initSTatus) {
			CGNP_no2_Pool.set(wallet, obj.oldGuardianNFT2.toString())
		}
	}
	return resolve (true)
})


// const testCGNPPoolProcess = async (wallet: string, _amounts: string) => {

// 	await GuardianNFTV4Contract.mintNode_NFTBatch([wallet], [_amounts])
// }

// testCGNPPoolProcess('0x609A656EAB159f808dE6DCf1FDB83b32e479da5e', '1')