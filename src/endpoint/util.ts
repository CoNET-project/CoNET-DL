import {ethers} from 'ethers'
import { logger, cCNTP_Contract, newCNTP_Contract, masterSetup } from '../util/util'
import rateABI from './conet-rate.json'
import Colors from 'colors/safe'
import {request as requestHttps} from 'node:https'
import EthCrypto from 'eth-crypto'
import {abi as CONET_Point_ABI} from '../util/conet-point.json'
import type {RequestOptions} from 'node:http'
import initCONETABI from './initCONET.json'
import ReferralsV3ABI from './ReferralsV3.json'
import {abi as claimableToken } from '../util/claimableToken.json'
const api_endpoint = 'https://api.conet.network/api/'
import oldGuardianABI from '../util/CGPNs.json'
import CGPNsV4ABI from './CGPNsV4.json'
export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[0])

const rateAddr = '0x3258e9631ca4992F6674b114bd17c83CA30F734B'.toLowerCase()


const checkTransfer = async (tx: string, rateBack: (rate: number) => void) => {
	const CONET_Holesky_RPC = new ethers.JsonRpcProvider('http://38.102.84.245:8000')
	const rateSC = new ethers.Contract(rateAddr, rateABI, CONET_Holesky_RPC)
	const transObj = await CONET_Holesky_RPC.getTransaction(tx)
	const toAddr = transObj?.to?.toLowerCase()
	if (!toAddr || toAddr !== rateAddr) {
		return
	}
	
	const rate = await rateSC.rate()
	logger(Colors.grey(`rateAddr fired! [${tx}] rate = [${ethers.formatEther(rate)}]`))
	return rateBack (rate)

}

const listenRateChange = async (block: number, rateBack: (rate: number) => void) => {
	const CONET_Holesky_RPC = new ethers.JsonRpcProvider('http://38.102.84.245:8000')
	const blockInfo = await CONET_Holesky_RPC.getBlock(block)
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
	const CONET_Holesky_RPC = new ethers.JsonRpcProvider('http://38.102.84.245:8000')
	const rateSC = new ethers.Contract(rateAddr, rateABI, CONET_Holesky_RPC)
	CONET_Holesky_RPC.on('block', async block => {
		listenRateChange(block, rateBack)
	})
	const rate = await rateSC.rate()
	const currentBlock = await CONET_Holesky_RPC.getBlockNumber()
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
			}, 3000)
			
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

	const cCNTPContract = new ethers.Contract(cCNTP_Contract, CONET_Point_ABI, wallet)

	logger(Colors.green(`Start a miner! [${wallet.address}]`))

	startTestMiner(url, JSON.stringify(sendData), (err, data) => {
		setTimeout(() => {
			resolve (true)
		}, 3000)
		if (err) {
			return logger(Colors.red(err))
		}
		
	})

})

const conetOldRPC = 'http://212.227.243.233:8000'
const initCONETContractAddr = '0xc78771Fc7C371b553188859023A14Ab3AbE08807'
const conetProvider = new ethers.JsonRpcProvider('https://rpc1.conet.network')
const referralsV3Addr ='0x8f6be4704a3735024F4D2CBC5BAC3722c0C8a0BD'
const old_cUSDTAddr = '0xfE75074C273b5e33Fe268B1d5AC700d5b715DA2f'
const old_cBNBUsdtAddr = '0xAE752B49385812AF323240b26A49070bB839b10D'
const old_cUSDBAddr = '0x3258e9631ca4992F6674b114bd17c83CA30F734B'
const oldGuardianAddr = '0x453701b80324C44366B34d167D40bcE2d67D6047'

const cUSDTAddr = '0x79E2EdE2F479fA7E44C89Bbaa721EB1f0d529b7B'
const bnbcUSDTAddr = '0xd008D56aa9A963FAD8FB1FbA1997C28dB85933e6'
const cUSDBAddr = '0x16cDB3C07Db1d58330FF0e930C3C58935CB6Cc97'

const blastCNTPv1Addr = '0x53634b1285c256aE64BAd795301322E0e911153D'
const newGuardianAddr = '0xF34798C87B8Dd74A83848469ADDfD2E50d656805'

export const initNewCONET: (wallet: string) =>Promise<boolean> = (wallet ) => new Promise(async resolve => {
	const managerWallet = new ethers.Wallet(masterSetup.cnptReferralAdmin, conetProvider)
	
	const initContract = new ethers.Contract(initCONETContractAddr, initCONETABI, managerWallet)

	const isInit = await initContract.checkInit(wallet)
	if (isInit) {
		logger(Colors.gray(`initNewCONET ${wallet} already INIT!`))
		return resolve (true)
	}
	
	logger(Colors.blue(`initNewCONET for wallet [${wallet}] isInit = ${isInit}`))
	
	const oldProvider = new ethers.JsonRpcProvider(conetOldRPC)
	const oldGuardianContract = new ethers.Contract(oldGuardianAddr, oldGuardianABI, oldProvider)
	const oldCntpContract =new ethers.Contract(cCNTP_Contract, CONET_Point_ABI, oldProvider)
	const oldReferralsContract = new ethers.Contract(referralsV3Addr, ReferralsV3ABI, oldProvider)
	const old_cUSDB = new ethers.Contract(old_cUSDBAddr, CONET_Point_ABI, oldProvider)
	const old_cBNBUsdt = new ethers.Contract(old_cBNBUsdtAddr, CONET_Point_ABI, oldProvider)
	const old_cUSDT = new ethers.Contract(old_cUSDTAddr, CONET_Point_ABI, oldProvider)
	const blastTestnet = new ethers.JsonRpcProvider('https://blast-sepolia.blockpi.network/v1/rpc/public')
	const oldCNTPv1 = new ethers.Contract(blastCNTPv1Addr, CONET_Point_ABI, blastTestnet)
	const new_cntpV1 = '0x6Eb683B666310cC4E08f32896ad620E5F204c8f8'
	const GuardianmanagerWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[0], conetProvider)
	const GuardianNFTV4Contract = new ethers.Contract(newGuardianAddr, CGPNsV4ABI, GuardianmanagerWallet)
	let conetOldB = BigInt(0), cntpOldB = BigInt(0), referrer = '0x0000000000000000000000000000000000000000', USDBoldB = BigInt(0), cBNBUoldB = BigInt(0), cUSDToldB = BigInt(0), cntpV1 = BigInt(0), oldGuardianNFT1 = BigInt(0), newGuardianNFT1 = BigInt(0)

	try {
		[conetOldB, cntpOldB, referrer, USDBoldB, cBNBUoldB, cUSDToldB, cntpV1, oldGuardianNFT1, newGuardianNFT1 ] = await Promise.all([
			oldProvider.getBalance(wallet),
			oldCntpContract.balanceOf(wallet),
			oldReferralsContract.getReferrer(wallet),
			old_cUSDB.balanceOf(wallet),
			old_cBNBUsdt.balanceOf(wallet),
			old_cUSDT.balanceOf(wallet),
			oldCNTPv1.balanceOf(wallet),
			oldGuardianContract.balanceOf(wallet, 1),
			GuardianNFTV4Contract.balanceOf(wallet, 1)
		])
	} catch (ex) {
		return resolve (false)
	}


	const managerWalletPool: ()=>Promise<true> = () => new Promise(async resolve => {
		if (conetOldB) {
			const ts = {
				to: wallet,
				// Convert currency unit from ether to wei
				value: conetOldB
			}
			try {
				await managerWallet.sendTransaction(ts)
			} catch (ex) {
				logger (Colors.red(`managerWalletPool managerWallet.sendTransaction (${wallet}) CONET ${conetOldB} Error!`), ex)
				return managerWalletPool()
			}
			conetOldB = BigInt(0)
		}

		if (referrer !== '0x0000000000000000000000000000000000000000') {
			const referralsContract = new ethers.Contract(referralsV3Addr, ReferralsV3ABI, managerWallet)
			try {
				await referralsContract.initAddReferrer(referrer, wallet)
			}catch (ex) {
				logger(Colors.red(`referralsV3Addr initAddReferrer(${referrer}, ${wallet}) error `), ex)
				return managerWalletPool()
			}
			referrer = '0x0000000000000000000000000000000000000000'
		}
		if (cntpOldB) {
			const cCNTPContract = new ethers.Contract(newCNTP_Contract, CONET_Point_ABI, managerWallet)
			try {
				await cCNTPContract.multiTransferToken([wallet], [cntpOldB])
			} catch (ex) {
				logger(Colors.red(`newCNTP_Contract multiTransferToken error ${wallet} ${cntpOldB}`), ex)
				return managerWalletPool()
			}
			cntpOldB = BigInt(0)
		}
	
		if (cntpV1) {
			const cCNTPV1Contract = new ethers.Contract(new_cntpV1, CONET_Point_ABI, managerWallet)
			try {
				await cCNTPV1Contract.multiTransferToken([wallet], [cntpV1])
			} catch (ex) {
				logger(Colors.red(`cCNTPV1Contract multiTransferToken error ${wallet} ${cntpV1}`), ex)
				return managerWalletPool()
			}
			cntpV1 = BigInt(0)
		}
		resolve (true)
	})

	const pool1: ()=>Promise<true> = () => new Promise(async resolve => {
		const wallet1 = new ethers.Wallet(masterSetup.cusdtAdmin, conetProvider)
		if (USDBoldB) {
			const usdbContract = new ethers.Contract(cUSDBAddr, claimableToken, wallet1)
			try {
				await usdbContract.mint(wallet, USDBoldB)
			} catch (ex) {
				logger(Colors.red(`usdbContract mint ${wallet} ${USDBoldB} Error`), ex)
				return pool1 ()
			}
			USDBoldB = BigInt(0)
			
		}
	
		if (cBNBUoldB) {
			const bnbUsdtContract = new ethers.Contract(bnbcUSDTAddr, claimableToken, wallet1)
			try {
				await bnbUsdtContract.mint(wallet, cBNBUoldB)
			} catch (ex) {
				logger(Colors.red(`bnbUsdtContract mint ${wallet} ${cBNBUoldB} Error`), ex)
				return pool1 ()
			}
			cBNBUoldB = BigInt(0)
		}
	
		if (cUSDToldB) {
			const usdtContract = new ethers.Contract(cUSDTAddr, claimableToken, wallet1)
			try {
				await usdtContract.mint(wallet, cUSDToldB)
			} catch (ex) {
				logger(Colors.red(`usdtContract mint ${wallet} ${cUSDToldB} Error`), ex)
				return pool1 ()
			}
			cUSDToldB = BigInt(0)
		}
		resolve (true)
	})

	const guardianDataRestore = async () => {
		const oldG  = parseInt(oldGuardianNFT1.toString())
		const newG =  parseInt(newGuardianNFT1.toString())
		if (oldG > 1) {
			if (newG === 0) {
				await GuardianNFTV4Contract.mintNode_NFTBatch ([wallet], [oldG])
				return logger(Colors.magenta(`guardianDataRestore added #1 NFT ${oldG} to wallet ${wallet}`))
			}
			if (newG !== oldG) {
				return logger(Colors.red(`guardianDataRestore ${wallet} old #1 NFT is (${oldG}) new NFT ${newG}`))
			}
		}
	}

	await Promise.all([
		managerWalletPool(),
		pool1(),
		guardianDataRestore()
	])

	await initContract.changeInit(wallet)
	return resolve (true)
})


// const testRate = async () => {
// 	const rate = await rateSC.rate()
// 	const totalMiner = BigInt(1500)
// 	const epochrate = rate/totalMiner
// 	logger(Colors.magenta(`epochrate = ${ethers.formatEther(epochrate)}`))
// }

// testRate()