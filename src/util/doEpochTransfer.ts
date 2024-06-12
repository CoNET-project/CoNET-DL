import {ethers} from 'ethers'

import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {masterSetup, s3fsPasswd, storageWalletProfile, getWasabiFile} from './util'
import Color from 'colors/safe'
import { logger } from './logger'
import { Client, auth, types } from 'cassandra-driver'
import type { TLSSocketOptions } from 'node:tls'
import {transferPool, startTransfer} from '../util/transferManager'
import {inspect} from 'node:util'
import { mapLimit} from 'async'

import rateABI from '../endpoint/conet-rate.json'
const conet_Holesky_RPC = 'https://rpc.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)


interface leaderboard {
	wallet: string
	referrals: string
	cntpRate: string
}

interface walletCount {
	cntp: number
	count: number
}

const tokensEachEPOCH = 34.72

const sslOptions: TLSSocketOptions = {
	key : masterSetup.Cassandra.certificate.key,
	cert : masterSetup.Cassandra.certificate.cert,
	ca : masterSetup.Cassandra.certificate.ca,
	rejectUnauthorized: masterSetup.Cassandra.certificate.rejectUnauthorized
}

const option = {
	contactPoints : masterSetup.Cassandra.databaseEndPoints,
	localDataCenter: 'dc1',
	authProvider: new auth.PlainTextAuthProvider ( masterSetup.Cassandra.auth.username, masterSetup.Cassandra.auth.password ),
	sslOptions: sslOptions,
	keyspace: masterSetup.Cassandra.keyspace,
	protocolOptions: { maxVersion: types.protocolVersion.v4 }
}


const store_Leaderboard_Free_referrals_toS3 = async (epoch: string, data: {referrals: leaderboard[], cntp: leaderboard[], referrals_rate_list: leaderboard[], totalMiner: string, minerRate: string}) => {
	if (!s3Pass) {
		return logger(Color.red(`store_Leaderboard_Free_referrals_toS3 s3Pass NULL error!`))
	}
	const obj = {
		data: JSON.stringify(data),
		hash: `${epoch}_free`
	}
	await storageWalletProfile(obj, s3Pass)
}


const getMinerCount = async (_epoch: number) => {
	let count = 0
	//free_wallets_657551
	const epoch = (_epoch).toString()

	
	
}

const getReferrer = async (address: string, callbak: (err: Error|null, data?: any) => void)=> {
	if (!address) {
		const err = `Call getReferrer address null error!`
		console.error(Color.red(err))
		return callbak (new Error(err))
	}
	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/wallet`,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		wallet: address
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {

			try {
				const ret = JSON.parse(data)
				return callbak (null, ret)
			} catch (ex: any) {
				console.error(`getReferrer JSON.parse(data) Error!`, data)
				return callbak (ex)
			}
			
		})
	})

	req.once('error', (e) => {
		console.error(`getReferrer req on Error! ${e.message}`)
		return callbak (e)
	})

	req.write(JSON.stringify(postData))
	req.end()
}

const postReferrals = async (epoch: string, totalMiner: string, minerRate: string, callbak: (err: Error|null, data?: any) => void )=> {

	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/free-data`,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		epoch, totalMiner, minerRate
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})

		res.once('end', () => {
			try {
				return callbak (null)
			} catch (ex: any) {
				console.error(`getReferrer JSON.parse(data) Error!`, data)
				return callbak (ex)
			}
			
		})
	})

	req.once('error', (e) => {
		console.error(`getReferrer req on Error! ${e.message}`)
		return callbak (e)
	})

	req.write(JSON.stringify(postData))
	req.end()
}

const countReword = (reword: number, wallet: string, totalToken: number, callback: (data: null|{wallet: string,pay: string}) => void) => {
	return getReferrer(wallet, async (err, data: any) => {
		if (err) {
			console.error(`getReferrer return err`, err)
			return callback (null)
		}
		
		if (data?.address !== '0x0000000000000000000000000000000000000000') {
			return callback ({ wallet: data.address, pay: (totalToken * reword).toFixed(0)})
		}
		return callback (null)
	})
}

interface returnData {
	addressList: string[]
	payList: string[]
}

const constCalculateReferralsCallback = (addressList: string[], payList: string[], CallBack: (data: returnData|null) => void) => {
	
	if (addressList.length <1) {
		return CallBack (null)
	}
	return CallBack ({addressList, payList})
	
}

const rateAddr = '0x9C845d9a9565DBb04115EbeDA788C6536c405cA1'.toLowerCase()

let s3Pass: s3pass | null
const splitLength = 1000

const stratFreeMinerTransfer = async (block: number) => {
	s3Pass = await s3fsPasswd()
	const data = await getWasabiFile (`free_wallets_${block}`)
	
	if (!data) {
		return logger(Color.red(`stratFreeMinerReferrals get EPOCH ${block} free_wallets_${block} error!`))
	}
	let walletArray: string[]
	try{
		walletArray = JSON.parse(data)
	} catch (ex) {
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} JSON parse Error!`))
	}
	
	if (!walletArray.length) {
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} Arraay is empty!`))
	}
	const rateSC = new ethers.Contract(rateAddr, rateABI, provider)
	const rate = (await rateSC.rate())

	const minerRate =  ethers.parseEther((tokensEachEPOCH/walletArray.length).toFixed(18))

	const _minerRate = rate / BigInt(walletArray.length)

	console.error(Color.blue(`daemon EPOCH = [${block}]  starting! minerRate = [${ parseFloat(minerRate.toString())/10**18 }] MinerWallets length = [${walletArray.length}]`))
	const kkk = walletArray.length
	const splitTimes = 1 + Math.round(kkk/splitLength)
	const splitBase =  Math.round(kkk/splitTimes)
	const dArray: string[][] = []

	logger(Color.red(`Array total = ${kkk} splitTimes = ${splitTimes} splitBase ${splitBase} payList = ${ethers.formatEther(_minerRate)}`))

	for (let i = 0, j = 0; i < kkk; i += splitBase, j ++) {
		const a  = walletArray.slice(i, i+ splitBase)
		dArray[j] = a
	}

	dArray.forEach( n => {
		transferPool.push({
			privateKey: masterSetup.conetFaucetAdmin,
			walletList: n,
			payList: n.map(n => ethers.formatEther(_minerRate))
		})
	})
	logger(Color.blue(`transferPool.length = ${transferPool.length}`))
	await startTransfer()
}


const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	provider.on('block', async block => {
		stratFreeMinerTransfer(block-2)
	})
}

startListeningCONET_Holesky_EPOCH_v2()