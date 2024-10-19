
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

const GuardianNodesInfoV6 = '0x9e213e8B155eF24B466eFC09Bcde706ED23C537a'
const CONET_Guardian_PlanV7 = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'.toLowerCase()
const provider = new ethers.JsonRpcProvider('https://rpc.conet.network')

const maxScanNodesNumber = 121
let getAllNodesProcess = false
let Guardian_Nodes: nodeInfo[] = []

const epochTotal: Map<number, Map<string, boolean>> = new Map()

const getAllNodes = async () => {
	if (getAllNodesProcess) {
		return
	}

	getAllNodesProcess = true

	const GuardianNodes = new ethers.Contract(CONET_Guardian_PlanV7, GuardianNodesV2ABI, provider)
	let scanNodes = 0
	try {
		const maxNodes: BigInt = await GuardianNodes.currentNodeID()
		scanNodes = parseInt(maxNodes.toString())

	} catch (ex) {
		return logger (`getAllNodes currentNodeID Error`, ex)
	}
	if (!scanNodes) {
		return logger(`getAllNodes STOP scan because scanNodes == 0`)
	}

	Guardian_Nodes = []

	for (let i = 0; i < maxScanNodesNumber; i ++) {
		
		Guardian_Nodes.push({
			region: '',
			ip_addr: '',
			armoredPublicKey: '',
			nftNumber: 100 + i,
			domain: ''
		})
	}
	const GuardianNodesInfo = new ethers.Contract(GuardianNodesInfoV6, NodesInfoABI, provider)

	await mapLimit(Guardian_Nodes, 5, async (n: nodeInfo, next) => {
		const nodeInfo = await GuardianNodesInfo.getNodeInfoById(n.nftNumber)
		n.region = nodeInfo.regionName
		n.ip_addr = nodeInfo.ipaddress
		n.armoredPublicKey = Buffer.from(nodeInfo.pgp,'base64').toString()
		const pgpKey1 = await readKey({ armoredKey: n.armoredPublicKey})
		n.domain = pgpKey1.getKeyIDs()[1].toHex().toUpperCase() + '.conet.network'
	})

	getAllNodesProcess = false
}

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

	wallets.forEach(n => {
		 start(n)
	})

	listenEposh()
}


const postToUrl = (node: nodeInfo, POST: string) => {
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
	}, 5 * 1000)

	const kkk = request(option, res => {
		clearTimeout(waitingTimeout)

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
}

const startGossip = (connectHash: string, node: nodeInfo, POST: string, callback?: (err?: string, data?: string) => void) => {
	
	
	const launch = launchMap.get (connectHash)||false
	if (launch) {
		return
	}

	launchMap.set (connectHash, true)

	const relaunch = () => setTimeout(() => {
		
		startGossip(connectHash, node, POST, callback)
		
	}, 1000)

	const waitingTimeout = setTimeout(() => {
		logger(Colors.red(`startGossip on('Timeout') [${node.ip_addr}:${node.nftNumber}]!`))
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

const getRandomNodeV2: (index: number) => null|nodeInfo = (index = -1) => { 
	const totalNodes = Guardian_Nodes.length - 1
	if (!totalNodes ) {
		return null
	}

	const nodoNumber = Math.floor(Math.random() * totalNodes)
	if (index > -1 && nodoNumber === index) {
		logger(Colors.grey(`getRandomNodeV2 nodoNumber ${nodoNumber} == index ${index} REUNING AGAIN!`))
		return getRandomNodeV2(index)
	}

	const node = Guardian_Nodes[nodoNumber]
	//logger(Colors.blue(`getRandomNodeV2 Guardian_Nodes length =${Guardian_Nodes.length} nodoNumber = ${nodoNumber} `))
	return node
}

const launchMap: Map<string, boolean> = new Map()

const connectToGossipNode = async ( wallet: ethers.Wallet ) => {
	const walletAddress = wallet.address.toLowerCase()
	
	
	const index = Math.floor(Math.random() * Guardian_Nodes.length - 1)
	const node = Guardian_Nodes[index]
	if (!node?.armoredPublicKey) {
		logger(Colors.red(`connectToGossipNode total ${Guardian_Nodes.length} nodes, index [${index}] ${node?.ip_addr} ${node?.nftNumber} armoredPublicKey Error restart connectToGossipNode`))
		connectToGossipNode(wallet)
		return 
	}

	const key = Buffer.from(getRandomValues(new Uint8Array(16))).toString('base64')
	
	const command = {
		command: 'mining',
		walletAddress,
		algorithm: 'aes-256-cbc',
		Securitykey: key,
	}
	
	const message =JSON.stringify(command)
	const signMessage = await wallet.signMessage(message)

	const encryptObj = {
        message: await createMessage({text: Buffer.from(JSON.stringify ({message, signMessage})).toString('base64')}),
		encryptionKeys: await readKey({armoredKey: node.armoredPublicKey}),
		config: { preferredCompressionAlgorithm: enums.compression.zlib } 		// compress the data with zlib
    }
	

	const postData = await encrypt (encryptObj)
	logger(Colors.blue(`connectToGossipNode ${node.domain}:${node.ip_addr}:${index}, wallet = ${wallet.signingKey.privateKey}:${walletAddress}`))

	startGossip(node.ip_addr+walletAddress, node, JSON.stringify({data: postData}), async (err, _data ) => {
		if (!_data) {
			return logger(Colors.magenta(`connectToGossipNode ${node.ip_addr} push ${_data} is null!`))
		}
		let data: listenClient
		try {
			data = JSON.parse(_data)
		} catch (ex) {
			logger(Colors.blue(`${node.ip_addr} => \n${_data}`))
			return logger(Colors.red(`connectToGossipNode JSON.parse(_data) Error!`))
		}

		const validatorNode = getRandomNodeV2(index)
		if (!validatorNode) {
			return logger(Colors.red(`validator getRandomNodeV2 return NULL error!`))
		}
		
		let epochObj = epochTotal.get(data.epoch)

		if (!epochObj) {
			epochObj = new Map()
			epochTotal.set(data.epoch, epochObj)
		}

		epochObj.set(walletAddress, true)

		data.minerResponseHash = await wallet.signMessage(data.hash)
		logger(Colors.grey(`${node.ip_addr}:${node.nftNumber} validator [${walletAddress}] post to ${validatorNode.ip_addr}:${validatorNode.nftNumber} epoch ${data.epoch} linsten clients [${epochObj.size}] miner [${data.nodeWallets.length}]:[${data.userWallets.length}]`))
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
		const signMessage = await wallet.signMessage(message)

		const encryptObj = {
			message: await createMessage({text: Buffer.from(JSON.stringify ({message, signMessage})).toString('base64')}),
			encryptionKeys: await readKey({armoredKey: validatorNode.armoredPublicKey}),
			config: { preferredCompressionAlgorithm: enums.compression.zlib } 		// compress the data with zlib
		}

		const _postData = await encrypt (encryptObj)
		

		postToUrl(validatorNode, JSON.stringify({data: _postData}))

	})
}

const start = (privateKeyArmor: string) => new Promise(async resolve => {
	const wallet = new ethers.Wallet(privateKeyArmor)
	connectToGossipNode(wallet)
})

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
		getWallet(wallet.mnemonic.phrase, 10, 0)
	}
}