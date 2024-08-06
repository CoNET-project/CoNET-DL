import {ethers} from 'ethers'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import { logger, cCNTP_Contract, newCNTP_Contract } from '../util/util'
import rateABI from './conet-rate.json'
import Colors from 'colors/safe'
import {request as requestHttps} from 'node:https'
import EthCrypto from 'eth-crypto'
import {abi as CONET_Point_ABI} from '../util/conet-point.json'
import type {RequestOptions} from 'node:http'
import initCONETABI from './initCONET.json'

const api_endpoint = 'https://api.conet.network/api/'


const setup = join( homedir(),'.master.json' )


const masterSetup: ICoNET_DL_masterSetup = require ( setup )

const Claimable_CONET_Point_addr = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'
const cntpV1_new_chain = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'.toLowerCase()
export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[0])

const rateAddr = '0x9C845d9a9565DBb04115EbeDA788C6536c405cA1'.toLowerCase()


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

export const initNewCONET: (wallet: string, provateKey: string) =>Promise<false|string> = (wallet, provateKey ) => new Promise(async resolve => {
	const managerWallet = new ethers.Wallet(provateKey, conetProvider)
	const initContract = new ethers.Contract(initCONETContractAddr, initCONETABI, managerWallet)
	const isInit = await initContract.checkInit(wallet)
	if (isInit) {
		logger(Colors.gray(`initNewCONET ${wallet} already INIT!`))
		return resolve (false)
	}
	logger(Colors.blue(`initNewCONET for wallet [${wallet}]`))
	const oldProvider = new ethers.JsonRpcProvider(conetOldRPC)
	const oldCntpContract =new ethers.Contract(cCNTP_Contract, CONET_Point_ABI, oldProvider)
	let conetOldB, cntpOldB
	try {
		[conetOldB, cntpOldB] = await Promise.all([
			oldProvider.getBalance(wallet),
			oldCntpContract.balanceOf(wallet)
		])
	} catch (ex) {
		resolve (false)
	}
	
	if (conetOldB) {
		const ts = {
			to: wallet,
			// Convert currency unit from ether to wei
			value: conetOldB
		}
		const [sendCONET_tx,] = 
		await Promise.all([
			managerWallet.sendTransaction(ts),
			initContract.changeInit(wallet)
		])

		logger(Colors.magenta(`initNewCONET send CONET ${ethers.formatEther(conetOldB)} => ${Colors.blue(wallet)} tx = ${sendCONET_tx.hash}`))
	}
	
	return resolve (ethers.formatEther(cntpOldB))
})


// const testRate = async () => {
// 	const rate = await rateSC.rate()
// 	const totalMiner = BigInt(1500)
// 	const epochrate = rate/totalMiner
// 	logger(Colors.magenta(`epochrate = ${ethers.formatEther(epochrate)}`))
// }

// testRate()