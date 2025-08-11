
import {ethers} from 'ethers'
import { logger } from '../util/logger'
import {inspect} from 'node:util'
import {mapLimit} from 'async'
import Colors from 'colors/safe'
import cCNTPABI from './CNTP_V1.ABI.json'

import {request as requestHttps} from 'node:https'
import GuardianNodesV2ABI from './CGPNv7New.json'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {createMessage, encrypt, enums, readKey} from 'openpgp'
import {getRandomValues} from 'node:crypto'
import {RequestOptions, request } from 'node:http'
import {request as httpsRequest } from 'node:https'
import ReferrerV3 from './ReferralsV3.json'
import CoNETDePINHoleskyABI from './CoNETDePINHolesky.json'
import CONET_Point_ABI from '../util/cCNTP.json'
import newNodeInfoABI from './newNodeInfoABI.json'

const GuardianNodesInfoV6 = '0x9e213e8B155eF24B466eFC09Bcde706ED23C537a'
const CONET_Guardian_PlanV7 = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'.toLowerCase()
const ReferrerV3Addr = '0xbd67716ab31fc9691482a839117004497761D0b9'
const provider = new ethers.JsonRpcProvider('https://cancun-rpc.conet.network')
const apiEndpoint = `https://apiv4.conet.network/api/`
const CCNTP_addr = '0x6C7C575010F86A311673432319299F3D68e4b522'
const CoNETDePINHoleskySCAddress = '0xa0822b9fe34f81dd926ff1c182cb17baf50004f7'

let getAllNodesProcess = false
let Guardian_Nodes: nodeInfo[] = []

const epochTotal: Map<number, Map<string, boolean>> = new Map()




const listenEposh = async () => {
	let currentEpoch = await provider.getBlockNumber()

	provider.on ('block', block => {
		currentEpoch  = block
		const obj = epochTotal.get(block-1)
		if (!obj) {
			return 
		}
		logger(Colors.magenta(`EPOCH ${block-1} Total connecting ${obj.size}`))
		epochTotal.delete(block-1)
	})
}

const airdrop = (privateKeyArmor: string, index: number) => new Promise (async resolve =>{
	const wallet = new ethers.Wallet(privateKeyArmor, provider)
	const CNTPSC = new ethers.Contract(CCNTP_addr, CONET_Point_ABI, wallet)
	try {
		const CoNETBalance = await provider.getBalance(wallet.address)
		const eth = parseFloat(ethers.formatEther(CoNETBalance))
		if (eth < 0.0001) {
			logger(`[${index}] airdrop skip ${wallet.address} because CONET = ${eth}`)
			return resolve(true)
		}

		
		const balanceCNTP = await CNTPSC.balanceOf(wallet.address)
		
		const CNTP_balance = parseInt(ethers.formatEther(balanceCNTP))
		if (CNTP_balance < 10 ) {
			logger(`[${index}] airdrop skip ${wallet.address} because CONET = ${eth} because CNTP balance < 0.001 = ${CNTP_balance}`)
			return resolve(true)
		}
		

		const tx = await CNTPSC.bronCNTP(balanceCNTP)
		await tx.wait()
		logger(Colors.blue(`[${index}] airdrop CNTP for ${wallet.address} balance = ${ethers.formatEther(balanceCNTP)} CNTPAirBridgeAirdrop hash = ${tx.hash}`))
		
		return resolve(true)
		

	} catch (ex: any) {
		logger(`airdrop ${wallet.address} Error ${ex.message}`)
		return resolve(false)
	}
})

const Referrer = '0x454428D883521C8aF9E88463e97e4D343c600914'.toLowerCase()
const addReferrer = (privateKeyArmor: string, index: number) => new Promise (async resolve => {
	const wallet = new ethers.Wallet(privateKeyArmor, provider)
	const ReferrerV3SC = new ethers.Contract(ReferrerV3Addr, ReferrerV3, wallet)
	
	try {
		const CoNETBalance = await provider.getBalance(wallet.address)
		const eth = ethers.formatEther(CoNETBalance)
		if (eth < '0.0001') {
			logger(`addReferrer skip ${wallet.address} because CONET = ${eth}`)
			return resolve(false)
		}
		
		const getReferrer = await ReferrerV3SC.getReferrer(wallet.address)
		if (getReferrer === '0x0000000000000000000000000000000000000000' && wallet.address.toLowerCase() !== Referrer) {
			const tx = await ReferrerV3SC.addReferrer(Referrer)
			logger(Colors.blue(`[${index}] addReferrer for ${wallet.address} SUCCESS! tx = ${tx.hash}`))
		}
		
		setTimeout(() => {
			return resolve(true)
		}, 500)
		

	} catch (ex: any) {
		logger(`[${index}] addReferrer ${wallet.address}  ${privateKeyArmor} Error!\n  ${ex.message}`)
		return resolve(false)
	}
})

const getWallet = async (SRP: string, max: number, __start: number) => {
	
	// await getAllNodes()

	const acc = ethers.Wallet.fromPhrase(SRP)
	const wallets: string[] = []
	if (__start === 0) {
		wallets.push (acc.signingKey.privateKey)
		__start++
	}

	for (let i = __start; i < max; i ++) {
		const sub = acc.deriveChild(i)
		wallets.push (sub.signingKey.privateKey)
	}

	let i = 0
	logger(Colors.red(`mining start total wallets from ${__start} to ${max} TOTAL = ${wallets.length}`))

	let ii = 0
	mapLimit(wallets, 10, async (n, next) => {
		await Promise.all([
			getFaucet (n),
			airdrop(n, ++ii),
			// addReferrer(n, ii)
		])
	}, err => {
		logger(`All wallets [${wallets.length}] getFaucet success! err = ${err}`)
	})
}

const httpsPostToUrl = (url: string, body: string) => new Promise(resolve =>{
	const _url = new URL (url)
	const option: RequestOptions = {
		host: _url.host,
		port: 443,
		method: 'POST',
		protocol: 'https:',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8'
		},
		path: _url.pathname,
	}
	const waitingTimeout = setTimeout(() => {
		logger(Colors.red(`httpsPostToUrl on('Timeout') [${url} ${JSON.parse(body)}!`))
		return resolve (false)
	}, 60 * 1000)

	const kkk = httpsRequest(option, res => {
		clearTimeout(waitingTimeout)
		setTimeout(() => {
			resolve (true)
		}, 1000)
		
		res.once('end', () => {
			if (res.statusCode !==200) {
				return logger(`httpsPostToUrl ${url} statusCode = [${res.statusCode}] != 200 error!`)
			}

		})
		
	})

	kkk.once('error', err => {
		logger(Colors.red(`httpsPostToUrl on('error') [${url}] requestHttps on Error! no call relaunch`), err.message)
	})

	kkk.end(body)

})

const postToUrl = (node: nodeInfo, POST: string) => new Promise(resolve =>{
	const option: RequestOptions = {
		host: node.ip_addr,
		port: 80,
		method: 'POST',
		protocol: 'http:',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8'
		},
		path: "/post",
	}

	const waitingTimeout = setTimeout(() => {
		logger(Colors.red(`postToUrl on('Timeout') [${node.ip_addr}:${node.nftNumber}]!`))
		return resolve (false)
	}, 5 * 1000)

	const kkk = request(option, res => {
		clearTimeout(waitingTimeout)
		resolve (true)
		res.once('end', () => {
			
			if (res.statusCode !==200) {
				return logger(`postToUrl ${node.ip_addr} statusCode = [${res.statusCode}] != 200 error!`)
			}
		})
		
	})

	kkk.once('error', err => {
		logger(Colors.red(`startGossip on('error') [${node.ip_addr}] requestHttps on Error! no call relaunch`), err.message)
	})

	kkk.end(POST)
})

const startGossip = (connectHash: string, node: nodeInfo, POST: string, relaunchCount: number = 0, callback?: (err?: string, data?: string) => void) => {
	
	const launch = launchMap.get (connectHash)||false
	if (launch) {
		return
	}

	launchMap.set (connectHash, true)

	const relaunch = () => setTimeout(() => {
		if (++relaunchCount > 5) {
			const err = `startGossip relaunchCount over 5 times STOP relaunchCount !`
			if (typeof callback === 'function') {
				callback (err)
			}
			return
		}
		logger(Colors.magenta(`startGossip do relaunch relaunchCount = ${relaunchCount} `))
		startGossip(connectHash, node, POST, relaunchCount, callback)
	}, 1000)

	const waitingTimeout = setTimeout(() => {
		logger(Colors.red(`startGossip on('Timeout') [${node.ip_addr}:${node.nftNumber}]!`))
		launchMap.set(connectHash, false)
		relaunch()
	}, 5 * 1000)

	const option: RequestOptions = {
		host: node.ip_addr,
		port: 80,
		method: 'POST',
		protocol: 'http:',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8'
		},
		path: "/post",
	}

	let first = true

	const kkk = request(option, res => {
		clearTimeout(waitingTimeout)
		launchMap.set(connectHash, false)
		
		let data = ''
		let _Time: NodeJS.Timeout
		

		if (res.statusCode !==200) {
			relaunch()
			return logger(`startGossip ${node.ip_addr} got statusCode = [${res.statusCode}] != 200 error! relaunch !!!`)
		}
		
		res.on ('data', _data => {
			relaunchCount = 0
			clearTimeout(_Time)
			data += _data.toString()
			
			if (/\r\n\r\n/.test(data)) {
				
				if (first) {
					first = false
					
					try{
						const uu = JSON.parse(data)
						// logger(inspect(uu, false, 3, true))
					} catch(ex) {
						logger(Colors.red(`first JSON.parse Error`), data)
					}
					data = ''
					return
				}

				data = data.replace(/\r\n/g, '')
				if (typeof callback === 'function') {
					callback ('', data)
				}
				
				data = ''

				_Time = setTimeout(() => {
					logger(Colors.red(`startGossip [${node.ip_addr}] has 2 EPOCH got NONE Gossip Error! Try to restart! `))
					res._destroy(null, () => {
						relaunch()
					})
				}, 24 * 1000)
			}
		})

		res.once('error', err => {
			res._destroy(null, () => {
				relaunch()
			})
			logger(Colors.red(`startGossip [${node.ip_addr}] res on ERROR! Try to restart! `), err.message)
		})

		res.once('end', () => {
			logger(`startGossip res on 'end'`)
			if (typeof callback === 'function') {
				logger(Colors.red(`startGossip [${node.ip_addr}] res on END! Try to restart! `))
				res._destroy(null, () => {
					relaunch()
				})
			}
			
		})
		
	})

	kkk.on('error', err => {
		logger(Colors.red(`startGossip on('error') [${node.ip_addr}] requestHttps on Error! no call relaunch`), err.message)
	})

	kkk.end(POST)

}

const getRandomNodeV2: (exclude: number) => Promise<null|{node: nodeInfo, index :number}> = (exclude = -1) => new Promise(async resolve => { 
	const totalNodes = Guardian_Nodes.length - 1
	if (totalNodes <= 0 ) {
		logger(`getRandomNodeV2 STOP because Guardian_Nodes length `)
		return resolve (null)
	}

	const index = Math.floor(Math.random() * totalNodes)
	if (exclude > -1 && exclude === index) {
		logger(Colors.grey(`getRandomNodeV2 exclude ${exclude} == index ${index} REUNING AGAIN!`))
		return getRandomNodeV2(exclude)
	}

	const node = Guardian_Nodes[index]

	const testConnect = await postToUrl(node, '')
	if (!testConnect) {
		logger(Colors.magenta(`${node.ip_addr} test connect was failed `))
		Guardian_Nodes.splice(index, 1)
		return getRandomNodeV2(exclude)
	}

	return resolve({node, index})
})

const launchMap: Map<string, boolean> = new Map()
const FaucetURL = `${apiEndpoint}conet-faucet`

const getFaucet = async (privateKeyArmor: string) => {
	const wallet = new ethers.Wallet(privateKeyArmor)
	const data = JSON.stringify({ walletAddr: wallet.address})

	logger(Colors.blue(`getFaucet for ${wallet.address}`))
	await httpsPostToUrl(FaucetURL, data)
}


const [,,...args] = process.argv
let _SRP = ''
let number = 1
let _start = 0
let isUser = false
args.forEach ((n, index ) => {

	if (/^P\=/i.test(n)) {
		const srp = n.split('=')[1]
		_SRP = srp
	}
	if (/^N\=/i.test(n)) {
		number = parseInt(n.split('=')[1])
	}

	if (/^S\=/i.test(n)) {
		_start = parseInt(n.split('=')[1])
	}
	
	if (/^U\=/i.test(n)) {
		isUser = n.split('=')[1] === 'true' ? true : false
	}
})


if ( _SRP && number > 0) {
	getWallet (_SRP, number, _start)
} else {
	const wallet = ethers.Wallet.createRandom()
	if (wallet?.mnemonic?.phrase) {
		getWallet(wallet.mnemonic.phrase, 1, 0)
	}
}