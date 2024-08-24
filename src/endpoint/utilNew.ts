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
import CGPNsV7_newABI from './CGPNv7New.json'
import {mapLimit} from 'async'
import {inspect} from 'node:util'
import faucet_init_ABI from './faucet_abi.json'
import faucet_new_ABI from './new_faucet.ABI.json'


export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[0])

const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'.toLowerCase()

const veryold_ConetProvider = new ethers.JsonRpcProvider('http://212.227.243.233:8000')
const old_2_ConetProvider = new ethers.JsonRpcProvider('http://74.208.39.153:8888')

const newCONETProvider = new ethers.JsonRpcProvider('https://rpc.conet.network')

const checkTransfer = async (tx: string, rateBack: (rate: number) => void) => {

	const rateSC = new ethers.Contract(rateAddr, rateABI, newCONETProvider)
	const transObj = await newCONETProvider.getTransaction(tx)
	const toAddr = transObj?.to?.toLowerCase()
	if (!toAddr || toAddr !== rateAddr) {
		return
	}
	
	const rate = await rateSC.rate()
	logger(Colors.grey(`rateAddr fired! [${tx}] rate = [${ethers.formatEther(rate)}]`))
	return rateBack (rate)

}

const listenRateChange = async (block: number, rateBack: (rate: number) => void) => {

	const blockInfo = await newCONETProvider.getBlock(block)
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
	EPOCH = await newCONETProvider.getBlockNumber()
	const rateSC = new ethers.Contract(rateAddr, rateABI, newCONETProvider)

	newCONETProvider.on('block', async block => {
		if (block === EPOCH + 1) {
			logger(Colors.grey(`startListeningCONET_Holesky_EPOCH_v2 epoch [${EPOCH}] rate = [${ethers.formatEther(rate)}]!`))
			listenRateChange(block, rateBack)
			EPOCH ++
		}
		
	})

	const rate = await rateSC.rate()

	
}


const blastTestnet = new ethers.JsonRpcProvider('https://blast-sepolia.blockpi.network/v1/rpc/public')

const initCONETContractAddr = '0xc78771Fc7C371b553188859023A14Ab3AbE08807'

const very_old_ReferralsV3Addr ='0x8f6be4704a3735024F4D2CBC5BAC3722c0C8a0BD'
const old_cUSDTAddr = '0xfE75074C273b5e33Fe268B1d5AC700d5b715DA2f'
const old_cBNBUsdtAddr = '0xAE752B49385812AF323240b26A49070bB839b10D'
const old_cUSDBAddr = '0x3258e9631ca4992F6674b114bd17c83CA30F734B'
const oldGuardianAddr = '0x453701b80324C44366B34d167D40bcE2d67D6047'

const oldReffAddr= '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'


const oldCNTPAddr = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'
const blastCNTPv1Addr = '0x53634b1285c256aE64BAd795301322E0e911153D'
const newGuardianAddr = '0xc3e210034868e8d739feE46ac5D1b1953895C87E'
const CNTP_old_Addr = '0x5B4d548BAA7d549D030D68FD494bD20032E2bb2b'
const initCONETAddr = '0xDAFD7bb588014a7D96501A50256aa74755953c18'

const new_USDT_addr = '0xc1CaB2539BbB59d45D739720942E257fF52aa708'
const new_BNBU_USDT_addr = '0xCc112a8Ec397808a4ffA0115Ad3d65ee0A8fab6c'
const new_USDB_addr = '0x37A35FFfa9cD133bB08d7359Ae7d90A6550951AA'

const new_CNTP_addr = '0xa4b389994A591735332A67f3561D60ce96409347'
const new_Guardian_addr = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'
const new_initCONET_faucet_addr = '0x9E70d462c434ca3f5aE567E9a406C08B2e25c066'
const newReffAddr = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const newCNTP_v1 = '0xb182d2c2338775B0aC3e177351D638b23D3Da4Ea'

interface sendCONETObj {
	wallet: string
	amount: string
}


const old_2_watch = new ethers.Wallet(masterSetup.initManager[0], old_2_ConetProvider)


const initmanagerW_0 = new ethers.Wallet(masterSetup.initManager[0], newCONETProvider)
const initmanagerW_1 = new ethers.Wallet(masterSetup.initManager[1], newCONETProvider)
const initmanagerW_2 = new ethers.Wallet(masterSetup.initManager[2], newCONETProvider)
const initmanagerW_3 = new ethers.Wallet(masterSetup.initManager[3], newCONETProvider)
const initmanagerW_4 = new ethers.Wallet(masterSetup.initManager[4], newCONETProvider)
const initmanagerW_5 = new ethers.Wallet(masterSetup.initManager[5], newCONETProvider)
const initmanagerW_6 = new ethers.Wallet(masterSetup.initManager[6], newCONETProvider)
const initmanagerW_7 = new ethers.Wallet(masterSetup.initManager[7], newCONETProvider)

const oldReferralsContract = new ethers.Contract(oldReffAddr, ReferralsV3ABI, old_2_ConetProvider)
const Guardian_Contract = new ethers.Contract(newGuardianAddr, CGPNsV7ABI, initmanagerW_2)

const old_CNTPContract = new ethers.Contract(CNTP_old_Addr, cCNTPv7ABI, old_2_watch)

const initCONETContract_old = new ethers.Contract(initCONETAddr, initCONET_ABI, old_2_watch)

const newCNTP_V1 = new ethers.Contract(newCNTP_v1, newCNTP_v1_ABI, initmanagerW_5)
const newUSDT = new ethers.Contract(new_USDT_addr, newUSDT_ABI, initmanagerW_0)
const newUSDB = new ethers.Contract(new_BNBU_USDT_addr, newUSDT_ABI, initmanagerW_6)
const new_BNB_USDT = new ethers.Contract(new_USDB_addr, newUSDT_ABI, initmanagerW_7)


const newCNTPContract = new ethers.Contract(new_CNTP_addr, cCNTPv7ABI, initmanagerW_1)
const new_Guardian_Contract = new ethers.Contract(new_Guardian_addr, CGPNsV7_newABI, initmanagerW_5)
const new_CONET_Faucet_COntract = new ethers.Contract(new_initCONET_faucet_addr, faucet_new_ABI, initmanagerW_4)
const newReff_Contract = new ethers.Contract(newReffAddr, ReferralsV3ABI, initmanagerW_3)


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
		const [status] = await new_Guardian_Contract.getBUYER_Status(n)

		if (!status){
			try {
				const uuu = await new_Guardian_Contract.mintBUYER_NFT(n, amounts[iii])
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
		const status = await new_Guardian_Contract.getREFERRER_Status(n)
		if (!status){
			try {
				const uuu = await new_Guardian_Contract.mintREFERRER_NFT(n, amounts[iii])
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
		const tx = await newReff_Contract.initAddReferrer(referrer, wallet)
		refferPool.delete(wallet)
		logger(Colors.magenta(`startRefferPool added Reffer (${referrer}, ${wallet}) tx=${tx.hash}`))
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
	let amount = 0
	pool.forEach((v,k) => {
		wallets.push(k)
		amounts.push(v)
		amount += parseFloat(ethers.formatEther(v))
	})

	try{
		const tx = await new_CONET_Faucet_COntract.changeInit_batch(wallets, amounts)
		sendCONETPool = []
		logger (Colors.blue(`startsendCONETPool transfer SUCCESS! total [${Colors.magenta(amount.toFixed(6))}] to total wallets [${Colors.magenta(wallets.length.toFixed(0))}]`))
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
		const tx = await newCNTP_V1.initAccount(first, amount)
		logger(Colors.blue(`Init wallet ${first} CNTP1!`))
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
	
	sendCNTPPool.forEach((v,key) => {})


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
	epoch = await newCONETProvider.getBlockNumber()
	logger(`startEposhTransfer epoch = ${epoch}`)
	newCONETProvider.on('block', async _block => {
		if ( _block === epoch + 1) {
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
		}
		
	})
}

interface oldDatObj {
	//		for CONET
	CONET_very_old_Balance: BigInt
	CONET_old_Balance: BigInt
	CONET_new_initStats: boolean
	CONET_old_initStats: boolean

	//	for referrer
	very_old_referrer: string
	old_referrer: string
	newReferrer: string

	//	for CNTP
	CNTP_very_old_Balance: BigInt
	CNTP_old_Balance: BigInt
	CNTP_old_initStats: boolean
	CNTP_initStats: boolean


	USDBoldB: BigInt
	cBNBUoldB: BigInt
	cUSDToldB: BigInt

	//	for CNTP V1
	CNTP_v1_Balance: BigInt
	CNTP_v1_initStats: boolean

	oldGuardianNFT1: BigInt
	newGuardianNFT1_initSTatus: [boolean, BigInt], 
	oldGuardianNFT2: BigInt
	newGuardianNFT2_initSTatus: boolean
	
	

	
	newUSDT_depositTx: boolean
	newUSDB_depositTx: boolean
	new_BNB_USDT_depositTx: boolean
	newCNTPBalance: BigInt
}

const initDataPool: Map<string, oldDatObj > = new Map()


const getAllOldData: (wallet: string) => Promise<false|oldDatObj> = (wallet: string) => new Promise ( async resolve => {


	const oldCntpContract =new ethers.Contract(oldCNTPAddr, CONET_Point_ABI, veryold_ConetProvider)
	const very_oldReferralsContract = new ethers.Contract(very_old_ReferralsV3Addr, ReferralsV3ABI, veryold_ConetProvider)
	const old_cUSDB = new ethers.Contract(old_cUSDBAddr, CONET_Point_ABI, veryold_ConetProvider)
	const old_cBNBUsdt = new ethers.Contract(old_cBNBUsdtAddr, CONET_Point_ABI, veryold_ConetProvider)
	const old_cUSDT = new ethers.Contract(old_cUSDTAddr, CONET_Point_ABI, veryold_ConetProvider)
	const oldCNTPv1 = new ethers.Contract(blastCNTPv1Addr, CONET_Point_ABI, blastTestnet)
	const oldGuardianContract = new ethers.Contract(oldGuardianAddr, oldGuardianABI, veryold_ConetProvider)

	let CONET_very_old_Balance = BigInt(0), 
	CONET_old_Balance = BigInt(0),
	CNTP_very_old_Balance = BigInt(0), 
	very_old_referrer ='0x0000000000000000000000000000000000000000', 
	newReferrer ='0x0000000000000000000000000000000000000000', 
	old_referrer='0x0000000000000000000000000000000000000000',
	USDBoldB = BigInt(0),
	cBNBUoldB = BigInt(0), cUSDToldB = BigInt(0), 
	
	CNTP_v1_Balance = BigInt(0), 

	oldGuardianNFT1 = BigInt(0), newGuardianNFT1_initSTatus = [], 
	oldGuardianNFT2 = BigInt(0), newGuardianNFT2_initSTatus = false, 
	
	CNTP_old_initStats = false,
	CONET_old_initStats = false, 
	CONET_new_initStats = false,
	CNTP_initStats = false,
	CNTP_old_Balance = BigInt(0), 

	CNTP_v1_initStats = false, 
	newUSDT_depositTx = false, 
	newUSDB_depositTx = false, 
	new_BNB_USDT_depositTx = false,
	newCNTPBalance = BigInt(0)
   
	try {
		
		[
			//			for CONET
			CONET_very_old_Balance, 
			CONET_old_Balance,
			CONET_old_initStats, 
			CONET_new_initStats,

			//			for referrer
			very_old_referrer,
			old_referrer,
			newReferrer,


			//			for CNTP
			CNTP_very_old_Balance,
			CNTP_old_initStats,
			CNTP_old_Balance,
			CNTP_initStats,
			

			USDBoldB, cBNBUoldB, cUSDToldB, 
			
			//			for old CNTP 
			CNTP_v1_Balance,
			CNTP_v1_initStats,

			oldGuardianNFT1, newGuardianNFT1_initSTatus, 
			oldGuardianNFT2, newGuardianNFT2_initSTatus, 

			 

			



			//CNTP_v1_initStats,
			//newUSDT_depositTx, newUSDB_depositTx, new_BNB_USDT_depositTx
		] = await Promise.all([
			//			for CONET
			veryold_ConetProvider.getBalance(wallet), 
			old_2_ConetProvider.getBalance(wallet),
			initCONETContract_old.checkInit(wallet), 
			new_CONET_Faucet_COntract.checkInit(wallet),

			//			for Referrals
			very_oldReferralsContract.getReferrer(wallet),
			oldReferralsContract.getReferrer(wallet),
			newReff_Contract.getReferrer(wallet),

			//			for CNTP
			oldCntpContract.balanceOf(wallet),  
			old_CNTPContract.initV2(wallet), 
			old_CNTPContract.balanceOf(wallet),
			newCNTPContract.initV2(wallet),
			

			old_cUSDB.balanceOf(wallet), old_cBNBUsdt.balanceOf(wallet), old_cUSDT.balanceOf(wallet), 
			
			//			for CNTP v1
			oldCNTPv1.balanceOf(wallet), newCNTP_V1.initV2(wallet),

			//			for Guardian Plan

			oldGuardianContract.balanceOf(wallet, 1), new_Guardian_Contract.getBUYER_Status(wallet),
			oldGuardianContract.balanceOf(wallet, 2), new_Guardian_Contract.getREFERRER_Status (wallet),

		

			//newCNTP_V1.checkInit(wallet),



			//newUSDT.depositTx(walletID),newUSDB.depositTx(walletID), new_BNB_USDT.depositTx(walletID),

		])

		const retObj: oldDatObj = {
			CONET_very_old_Balance, 
			CONET_old_Balance,
			CNTP_very_old_Balance, very_old_referrer, USDBoldB, cBNBUoldB, cUSDToldB, 
			CNTP_v1_Balance,
			oldGuardianNFT1, newGuardianNFT1_initSTatus,
			oldGuardianNFT2, newGuardianNFT2_initSTatus, 
			CNTP_old_initStats, CNTP_old_Balance,
			newReferrer, 
			CNTP_initStats,
			old_referrer,
			CONET_old_initStats, 
			CONET_new_initStats,
			CNTP_v1_initStats,

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
	

	// logger(Colors.blue(`cCNTP_initStats ${wallet} CNTP old [${ethers.formatEther(obj.cntpOldB.toString())}] new [${ethers.formatEther(obj.newCNTPBalance.toString())}] [${obj.cCNTP_old_initStats}]`))

	if ( ! obj.CONET_new_initStats ) {
		let balance = obj.CONET_very_old_Balance > obj.CONET_old_Balance ? obj.CONET_very_old_Balance : obj.CONET_old_Balance
		if (obj.CONET_old_initStats && balance < obj.CONET_very_old_Balance) {
			balance = ethers.parseEther((parseFloat(ethers.formatEther(obj.CONET_very_old_Balance.toString())) +  parseFloat(ethers.formatEther(obj.CONET_old_Balance.toString()))).toFixed(6))
		}

		if (balance) {
			const stats = `${obj.CONET_old_initStats}`
			logger(Colors.magenta((`Init Wallet [${Colors.blue(wallet)}] old init stats is [${Colors.blue(stats)}] transfer CONET token ${Colors.blue(ethers.formatEther(balance.toString()))}`)))

			sendCONETPool.push({
				wallet,
				amount:balance.toString()
			})
		}
		
	}


	if (obj.newReferrer === '0x0000000000000000000000000000000000000000') {
		const referrer = obj.old_referrer === '0x0000000000000000000000000000000000000000' ? obj.very_old_referrer: obj.old_referrer
		if (referrer !== '0x0000000000000000000000000000000000000000') {
			refferPool.set(wallet, referrer)
		}
	}

	if (!obj.CNTP_initStats) {
		let CNTP_balance = obj.CNTP_very_old_Balance > obj.CNTP_old_Balance ? obj.CNTP_very_old_Balance : obj.CNTP_old_Balance
		if (obj.CNTP_old_initStats && obj.CNTP_old_Balance < obj.CNTP_very_old_Balance) {
			CNTP_balance = ethers.parseEther((parseFloat(ethers.formatEther(obj.CNTP_old_Balance.toString())) +  parseFloat(ethers.formatEther(obj.CNTP_very_old_Balance.toString()))).toFixed(6))
		}
		
		if (CNTP_balance) {
			sendCNTPPool.set(wallet, CNTP_balance.toString())
		}
	}

	if (obj.CNTP_v1_Balance && !obj.CNTP_v1_initStats) {
		logger(Colors.blue(`Wallet ${wallet} has CNTP balance ${ethers.formatEther(obj.CNTP_v1_Balance.toString())} INIT to new `))
		sendCNTPv1Pool.set(wallet, obj.CNTP_v1_Balance.toString())
	}
	


	// if (obj.cUSDToldB && !obj.newUSDT_depositTx) {
	// 	usdtPool.set(wallet,obj.cUSDToldB.toString())
	// }

	// if (obj.cBNBUoldB && !obj.new_BNB_USDT_depositTx) {
	// 	bnbUsdtPool.set(wallet, obj.cBNBUoldB.toString())
	// }

	// if (obj.USDBoldB && !obj.newUSDB_depositTx) {
	// 	usdbPool.set(wallet, obj.USDBoldB.toString())
	// }

	const oldG1 = parseInt(obj.oldGuardianNFT1.toString())

	if (oldG1 > 0 && !obj.newGuardianNFT1_initSTatus[0] ) {
		logger(Colors.blue(`${wallet} has NFT #1 asset && newGuardianNFT1_initSTatus[0] = ${obj.newGuardianNFT1_initSTatus[0]}`))
		
			CGNP_no1_Pool.set(wallet, obj.oldGuardianNFT1.toString())
		
	}

	const oldG2 = parseInt(obj.oldGuardianNFT2.toString())
	if (oldG2 > 0 && !obj.newGuardianNFT2_initSTatus) {
		logger(Colors.blue(`${wallet} has NFT #2 asset && newGuardianNFT1_initSTatus[0] = ${obj.newGuardianNFT2_initSTatus}`))
		
		CGNP_no2_Pool.set(wallet, obj.oldGuardianNFT2.toString())
		
	}

	return resolve (true)
})

// const test = async () => {
// 	startEposhTransfer()
// 	const wallet = '0xE482da05cB82d2b996780Db17D8B916356E1323d'
// 	await initNewCONET(wallet)
// }


// const test1 = async () => {
// 	const [nodeAddressArray] = await new_Guardian_Contract.getAllIdOwnershipAndBooster()
// 	let ii = 0
// 	mapLimit(nodeAddressArray, 1, async (n: string, next ) => {
// 		const result= await initNewCONET(n)
// 		logger(Colors.grey (`[${ii++}] wallet ${n} success!`))
// 	})
	
// }

// test()

// const testCGNPPoolProcess = async (wallet: string, _amounts: string) => {

// 	await GuardianNFTV4Contract.mintNode_NFTBatch([wallet], [_amounts])
// }

// testCGNPPoolProcess('0x609A656EAB159f808dE6DCf1FDB83b32e479da5e', '1')