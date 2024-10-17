
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

const maxScanNodesNumber = 110
let getAllNodesProcess = false
let Guardian_Nodes: nodeInfo[] = []


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

}

const startGossip = (node: nodeInfo, POST: string, callback?: (err?: string, data?: string) => void) => {
	

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

		if (res.statusCode !==200) {
			return logger(`startTestMiner ${node.ip_addr} got res.statusCode = [${res.statusCode}] != 200 error!`)
		}

		let data = ''
		let _Time: NodeJS.Timeout

		res.on ('data', _data => {
			clearTimeout(_Time)
			data += _data.toString()
			

			if (/\r\n\r\n/.test(data)) {
				
				if (first) {
					first = false
					logger(Colors.magenta(`first`))
					try{
						const uu = JSON.parse(data)
						logger(inspect(uu, false, 3, true))
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
					kkk.destroy()
				}, 24 * 1000)
			}
		})

		res.once('error', err => {
			startGossip (node, POST, callback)
			logger(Colors.red(`startGossip [${node.ip_addr}] res on ERROR! Try to restart! `), err.message)
		})

		res.once('end', () => {

			kkk.destroy()
			if (typeof callback === 'function') {
				logger(Colors.red(`startGossip [${node.ip_addr}] res on END! Try to restart! `))
				setTimeout(() => {
					startGossip (node, POST, callback)
				}, 1000)
			}
			
		})
		
	})

	kkk.on('error', err => {
		logger(Colors.red(`startGossip on('error') [${node.ip_addr}] requestHttps on Error! Try to restart! `), err.message)
		setTimeout(() => {
			
			startGossip (node, POST, callback)
		}, 1000)
		
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
	logger(Colors.blue(`getRandomNodeV2 Guardian_Nodes length =${Guardian_Nodes.length} nodoNumber = ${nodoNumber} `))
	return node
}

const connectToGossipNode = async ( wallet: ethers.Wallet ) => {
	
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
		walletAddress: wallet.address.toLowerCase(),
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
	logger(Colors.blue(`connectToGossipNode ${node.domain}:${node.ip_addr}, wallet = ${wallet.signingKey.privateKey}:${wallet.address.toLowerCase()}`))
	logger(inspect(node))

	startGossip(node, JSON.stringify({data: postData}), async (err, _data ) => {
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
		
		data.minerResponseHash = await wallet.signMessage(data.hash)
		data.isUser = isUser
		data.userWallets = data.nodeWallets = []
		const command = {
			command: 'mining_validator',
			walletAddress: wallet.address.toLowerCase(),
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
		logger(Colors.grey(`validator [${wallet.address.toLowerCase()}] post to ${validatorNode.ip_addr} epoch ${data.epoch} total miner [${data.online}]`))
		startGossip(validatorNode, JSON.stringify({data: _postData}))

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
}