import {ethers} from 'ethers'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import cCNTPAbi from '../util/cCNTP.json'
import { logger, cCNTP_Contract } from '../util/util'
import rateABI from './conet-rate.json'
import Colors from 'colors/safe'
import {request as requestHttps} from 'node:https'
import EthCrypto from 'eth-crypto'
import {abi as CONET_Point_ABI} from '../util/conet-point.json'
import type {RequestOptions} from 'node:http'



const api_endpoint = 'https://api.conet.network/api/'
const CONET_Holesky_RPC = new ethers.JsonRpcProvider('http://38.102.84.245:8000')
cCNTP_Contract
const setup = join( homedir(),'.master.json' )


const masterSetup: ICoNET_DL_masterSetup = require ( setup )

const Claimable_CONET_Point_addr = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'
const cntpV1_new_chain = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'.toLowerCase()
export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[0])
const sendCNTP_v2_New_ChainContract = new ethers.Contract(cntpV1_new_chain, cCNTPAbi, CONET_Holesky_RPC)



const rateAddr = '0x9C845d9a9565DBb04115EbeDA788C6536c405cA1'.toLowerCase()

const rateSC = new ethers.Contract(rateAddr, rateABI, CONET_Holesky_RPC)


const checkTransfer = async (tx: string, rateBack: (rate: number) => void) => {
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
			return callback(`res.statusCode[$${res.statusCode}] !==200`)
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
		return logger(Colors.red(`startTestMiner had Error [${err.message}]`))
	})

	kkk.once('end', () => {
		return callback('end')
	})

	kkk.end(POST)

}

export const start = (privateKeyArmor: string) => new Promise(async resolve => {
		
	const wallet = new ethers.Wallet(privateKeyArmor, CONET_Holesky_RPC)
	const message  = JSON.stringify({walletAddress: wallet.address.toLowerCase()})
	const messageHash =  ethers.id(message)
	const signMessage = EthCrypto.sign(privateKeyArmor, messageHash)
	const sendData = {
		message, signMessage
	}

	const url = `${ api_endpoint }startMining`

	const cCNTPContract = new ethers.Contract(cCNTP_Contract, CONET_Point_ABI, wallet)

	let first = true
	let CNTPbalance = await cCNTPContract.balanceOf(wallet.address)
	logger(Colors.green(`Start a miner! [${wallet.address}]`))

	startTestMiner(url, JSON.stringify(sendData), (err, data) => {
		setTimeout(() => {
			resolve (true)
		}, 2000)
		
		logger(Colors.green(`startTestMiner response!`))
		if (err) {
			return logger(Colors.red(err))
		}
		return logger(Colors.blue(`${data}`))
	})

})

// const testRate = async () => {
// 	const rate = await rateSC.rate()
// 	const totalMiner = BigInt(1500)
// 	const epochrate = rate/totalMiner
// 	logger(Colors.magenta(`epochrate = ${ethers.formatEther(epochrate)}`))
// }

// testRate()