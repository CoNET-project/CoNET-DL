
import {ethers} from 'ethers'
import { logger } from '../util/logger'
import {inspect} from 'node:util'
import {mapLimit} from 'async'
import Colors from 'colors/safe'

import {request as requestHttps} from 'node:https'
import GuardianNodesV2ABI from './CGPNv7New.json'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {createMessage, encrypt, enums, readKey,generateKey, GenerateKeyOptions, readPrivateKey, decryptKey} from 'openpgp'
import {getRandomValues} from 'node:crypto'
import {RequestOptions, request } from 'node:http'
import {request as httpsRequest } from 'node:https'
import ReferrerV3 from './ReferralsV3.json'
const GuardianNodesInfoV6 = '0x9e213e8B155eF24B466eFC09Bcde706ED23C537a'
const CONET_Guardian_PlanV7 = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'.toLowerCase()
const ReferrerV3Addr = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const provider = new ethers.JsonRpcProvider('https://rpc.conet.network')
const apiEndpoint = `https://apiv4.conet.network/api/`



let getAllNodesProcess = false
let Guardian_Nodes: nodeInfo[] = []

const epochTotal: Map<number, Map<string, boolean>> = new Map()

const getAllNodes = () => new Promise(async resolve=> {
	
	if (getAllNodesProcess) {
		return resolve (true)
	}

	getAllNodesProcess = true

	const GuardianNodes = new ethers.Contract(CONET_Guardian_PlanV7, GuardianNodesV2ABI, provider)
	let scanNodes = 0
	try {
		const maxNodes: BigInt = await GuardianNodes.currentNodeID()
		scanNodes = parseInt(maxNodes.toString())

	} catch (ex) {
		resolve (false)
		return logger (`getAllNodes currentNodeID Error`, ex)
	}
	if (!scanNodes) {
		resolve (false)
		return logger(`getAllNodes STOP scan because scanNodes == 0`)
	}

	Guardian_Nodes = []

	for (let i = 0; i < scanNodes; i ++) {
		Guardian_Nodes.push({
			region: '',
			ip_addr: '',
			armoredPublicKey: '',
			nftNumber: 100 + i,
			domain: ''
		})
	}
		
	const GuardianNodesInfo = new ethers.Contract(GuardianNodesInfoV6, NodesInfoABI, provider)
	let i = 0
	mapLimit(Guardian_Nodes, 10, async (n: nodeInfo, next) => {
		i = n.nftNumber
		const nodeInfo = await GuardianNodesInfo.getNodeInfoById(n.nftNumber)
		n.region = nodeInfo.regionName
		n.ip_addr = nodeInfo.ipaddress
		n.armoredPublicKey = Buffer.from(nodeInfo.pgp,'base64').toString()
		const pgpKey1 = await readKey({ armoredKey: n.armoredPublicKey})
		n.domain = pgpKey1.getKeyIDs()[1].toHex().toUpperCase()
	}, err => {
		const index = Guardian_Nodes.findIndex(n => n.nftNumber === i) - 1
		Guardian_Nodes = Guardian_Nodes.slice(0, index)
		logger(Colors.red(`mapLimit catch ex! Guardian_Nodes = ${Guardian_Nodes.length} `))
		Guardian_Nodes = Guardian_Nodes.filter(n => n.armoredPublicKey)
		resolve(true)
	})
})



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

const addReferrer = (privateKeyArmor: string) => new Promise (async resolve => {
	const wallet = new ethers.Wallet(privateKeyArmor, provider)
	const ReferrerV3SC = new ethers.Contract(ReferrerV3Addr, ReferrerV3, wallet)
	
	try {
		const CoNETBalance = await provider.getBalance(wallet.address)
		const eth = ethers.formatEther(CoNETBalance.toString())
		if (eth < '0.0001') {
			logger(`addReferrer skip ${wallet.address} because CONET = ${CoNETBalance.toString()}`)
			return resolve(false)
		}
		logger(Colors.blue(`addReferrer for ${wallet.address} balance = ${eth}`))
		const kk = await ReferrerV3SC.
		const tx = await ReferrerV3SC.addReferrer('0x454428D883521C8aF9E88463e97e4D343c600914')
		logger(tx)
		setTimeout(() => {
			return resolve(true)
		}, 500)
		

	} catch (ex: any) {
		logger(`addReferrer ${wallet.address} Error  ${ex.message}`)
		return resolve(false)
	}
})

const getWallet = async (SRP: string, max: number, __start: number) => {
	
	await getAllNodes()

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
	wallets.forEach(n => {
		
		connectToGossipNode(n, i ++)
	})
	
	listenEposh()
	mapLimit(wallets, 1, async (n, next) => {
		await getFaucet (n)
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
const listenningPool: Map<string, NodeJS.Timeout> = new Map()
const FaucetURL = `${apiEndpoint}conet-faucet`

const getFaucet = async (privateKeyArmor: string) => {
	const wallet = new ethers.Wallet(privateKeyArmor)
	const data = JSON.stringify({ walletAddr: wallet.address})
	logger(Colors.blue(`getFaucet for ${wallet.address}`))
	const uuu = await httpsPostToUrl(FaucetURL, data)

}


const connectToGossipNode = async ( privateKeyArmor: string, connectingNUmber: number ) => {
	const wallet = new ethers.Wallet(privateKeyArmor)
	const walletAddress = wallet.address.toLowerCase()
	
	const nodeInfo = await getRandomNodeV2(-1)
	
	if (!nodeInfo) {
		return logger(Colors.red(`connectToGossipNode getRandomNodeV2 return null `))
	}

	const validatorNode = await getRandomNodeV2(nodeInfo.index)
	if (!validatorNode) {
		return logger(Colors.red(`connectToGossipNode getRandomNodeV2 for validatorNode return null `))
	}

	//logger(Colors.magenta(`connectToGossipNode started for ${nodeInfo.node.ip_addr} validatorNode ${validatorNode.node.ip_addr}`))
	const key = Buffer.from(getRandomValues(new Uint8Array(16))).toString('base64')
	const command = {
		command: 'mining',
		walletAddress,
		algorithm: 'aes-256-cbc',
		Securitykey: key,
	}
	
	const message = JSON.stringify(command)
	
	wallet.signMessage(message)
	
	.then (signMessage => Promise.all([
		createMessage({text: Buffer.from(JSON.stringify ({message, signMessage})).toString('base64')}),
		readKey({armoredKey: nodeInfo.node.armoredPublicKey})
	]))
		
	.then ( value => encrypt({message: value[0], encryptionKeys: value[1], config: { preferredCompressionAlgorithm: enums.compression.zlib }}))
	.then (postData => {
		
		let time = setTimeout(() => {
			logger(Colors.magenta(`${connectingNUmber} ${wallet} listenning ${nodeInfo.index} ${nodeInfo.node.ip_addr} Timeout! *************`))
		}, 24 * 1000)

		listenningPool.set (walletAddress, time)

		logger(Colors.blue(`[${connectingNUmber}] total connect = ${listenningPool.size} ${nodeInfo.node.domain}:${nodeInfo.node.ip_addr}:${nodeInfo.index} ${walletAddress}`))
		
		startGossip(nodeInfo.node.ip_addr+walletAddress, nodeInfo.node, JSON.stringify({data: postData}), 0, async (err, _data ) => {
			

			if (err) {
				logger(Colors.red(err))
				return connectToGossipNode(privateKeyArmor, connectingNUmber)
			}

			if (!_data) {
				return logger(Colors.magenta(`connectToGossipNode ${nodeInfo.node.ip_addr} push ${_data} is null!`))
			}
			clearTimeout(time)


			let data: listenClient
			try {
				data = JSON.parse(_data)
			} catch (ex) {
				logger(Colors.blue(`${nodeInfo.node.ip_addr} => \n${_data}`))
				return logger(Colors.red(`connectToGossipNode JSON.parse(_data) Error!`))
			}
			let epoch = parseInt(data.epoch.toString())
			let epochObj = epochTotal.get(epoch)
	
			if (!epochObj) {
				epochObj = new Map()
				epochTotal.set(epoch, epochObj)
			}
	
			epochObj.set(walletAddress, true)
			
			// const messageVa = {epoch: data.epoch.toString(), wallet: walletAddress}
			// const nodeWallet = ethers.verifyMessage(JSON.stringify(messageVa), data.hash).toLowerCase()

			// if (nodeWallet !== data.nodeWallet.toLowerCase()) {
			// 	logger(Colors.red(`${nodeInfo.node.ip_addr} validatorMining verifyMessage hash Error! nodeWallet ${nodeWallet} !== validatorData.nodeWallet.toLowerCase() ${data.nodeWallet.toLowerCase()}`))
			// }

			data.minerResponseHash = await wallet.signMessage(data.hash)

			//logger(Colors.grey(`[${connectingNUmber}:${listenningPool.size}]=>${nodeInfo.node.ip_addr}:${nodeInfo.node.nftNumber} validator [${walletAddress}] post to ${validatorNode.node.ip_addr}:${validatorNode.node.nftNumber} epoch ${data.epoch} linsten clients [${epochObj.size}] miner [${data.nodeWallets.length}]:[${data.userWallets.length}]`))
			data.isUser = isUser
			data.userWallets = data.nodeWallets = []
			const command = {
				command: 'mining_validator',
				walletAddress,
				algorithm: 'aes-256-cbc',
				Securitykey: key,
				requestData: data
			}
	
			const message =JSON.stringify(command)
			wallet.signMessage(message)
			.then (signMessage => Promise.all([
				createMessage({text: Buffer.from(JSON.stringify ({message, signMessage})).toString('base64')}),
				readKey({armoredKey: validatorNode.node.armoredPublicKey})
			]))
			.then ( value => encrypt({message: value[0], encryptionKeys: value[1], config: { preferredCompressionAlgorithm: enums.compression.zlib }}))
			.then (postData => {
				postToUrl(validatorNode.node, JSON.stringify({data: postData}))
			})
			.catch(ex => {
				return logger(Colors.red(`startGossip Error! ${nodeInfo.node.ip_addr} ${nodeInfo.node.armoredPublicKey} error!`))
			})
	
			// const encryptObj = {
			// 	message: await createMessage({text: Buffer.from(JSON.stringify ({message, signMessage})).toString('base64')}),
			// 	encryptionKeys: await readKey({armoredKey: validatorNode.armoredPublicKey}),
			// 	config: { preferredCompressionAlgorithm: enums.compression.zlib } 		// compress the data with zlib
			// }
	
			// const _postData = await encrypt (encryptObj)
			
	
		})
	}).catch(ex => {
		return logger(Colors.red(`await readKey ${nodeInfo.node.ip_addr} ${nodeInfo.node.armoredPublicKey} error!`))
	})

	
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