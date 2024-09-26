
import {ethers} from 'ethers'
import { logger } from '../util/logger'
import {inspect} from 'node:util'
import {mapLimit} from 'async'
import EthCrypto from 'eth-crypto'
import Colors from 'colors/safe'

import {request as requestHttps} from 'node:https'
import GuardianNodesV2ABI from './CGPNv7New.json'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {createMessage, encrypt, enums, readKey, Key} from 'openpgp'
import {getRandomValues} from 'node:crypto'
import {RequestOptions, request } from 'node:http'

const GuardianNodesInfoV6 = '0x9e213e8B155eF24B466eFC09Bcde706ED23C537a'
const CONET_Guardian_PlanV7 = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'.toLowerCase()
const provider = new ethers.JsonRpcProvider('https://rpc.conet.network')

const maxScanNodesNumber = 20
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
	wallets.push (acc.signingKey.privateKey)
	for (let i = __start; i < max; i ++) {
		const sub = acc.deriveChild(i)
		wallets.push (sub.signingKey.privateKey)
	}


	let i = 0

	mapLimit(wallets, 5, async (n, next) => {
		i++
		logger (`start connect ${i}`)
		await start(n)
	})

}

const startGossip = (node: nodeInfo, POST: string, callback: (err?: string, data?: string) => void) => {
	

	const option: RequestOptions = {
		hostname: node.domain,
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
			return logger(`startTestMiner got res.statusCode = [${res.statusCode}] != 200 error! restart`)
		}

		let data = ''
		let _Time: NodeJS.Timeout

		res.on ('data', _data => {
			clearTimeout(_Time)
			data += _data.toString()
			

			if (/\r\n\r\n/.test(data)) {
				
				if (first) {
					first = false
					data = ''
					return
				}

				data = data.replace(/\r\n/g, '')
				callback ('', data)
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
			logger(Colors.red(`startGossip [${node.ip_addr}] res on END! Try to restart! `))
		})
		
	})

	kkk.on('error', err => {
		
		setTimeout(() => {
			logger(Colors.red(`startGossip [${node.ip_addr}] requestHttps on Error! Try to restart! `), err.message)
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
		return getRandomNodeV2(index)
	}

	const node = Guardian_Nodes[nodoNumber]
	if (!node.ip_addr) {
		return getRandomNodeV2 (index)
	}
	
	return node
}

// const ceateMininngValidator = async (wallet: ethers.Wallet, node: nodeInfo, requestData: any = null) => {
	
// 	const key = Buffer.from(self.crypto.getRandomValues(new Uint8Array(16))).toString('base64')
// 	const command = {
// 		command: 'mining_validator',
// 		algorithm: 'aes-256-cbc',
// 		Securitykey: key,
// 		requestData,
// 		walletAddress: wallet.address.toLowerCase()
// 	}


// 	const message =JSON.stringify(command)

// 	const signMessage = await wallet.signMessage(message)
// 	let privateKeyObj = null

// 	try {
// 		privateKeyObj = await makePrivateKeyObj (currentProfile.pgpKey.privateKeyArmor)
// 	} catch (ex){
// 		return logger (ex)
// 	}

// 	const encryptedCommand = await encrypt_Message( privateKeyObj, node.armoredPublicKey, {message, signMessage})
// 	command.requestData = [encryptedCommand, '', key]
// 	return (command)
// }

// const validator = async (data: listenClient, wallet: ethers.Wallet, sentryNode: nodeInfo) => {
// 	if (!data.hash) {
// 		logger(data)
// 		return logger(`checkMiningHash got NULL response.hash ERROR!`)
// 	}
// 	const message = JSON.stringify({epoch: data.epoch, wallet: wallet.address.toLowerCase()})

// 	const va = ethers.verifyMessage(message, data.hash)

// 	if (va.toLowerCase() !== data.nodeWallet.toLowerCase()) {
// 		return logger(`validator va${va.toLowerCase()} !== response.nodeWallet ${data.nodeWallet.toLowerCase()}`)
// 	}
// 	const response = {
// 		minerResponseHash: await wallet.signMessage(data.hash)
// 	}

// 	const request = await ceateMininngValidator(profile, sentryNode, response)

// 	if (!request) {
// 		return logger(`ceateMininngValidator got null Error!`)
// 	}

// 	const url = `https://${sentryNode.domain}/post`
// 	const req = await postToEndpoint(url, true, {data: request.requestData[0]}).catch(ex => {
// 		logger(ex)
// 	})

// 	logger(req)
// }

const connectToGossipNode = async ( wallet: ethers.Wallet ) => {
	
	const index = Math.floor(Math.random() * Guardian_Nodes.length - 1)
	const node = Guardian_Nodes[index]

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
	logger(Colors.blue(`connectToGossipNode ${node.domain}:${node.ip_addr}`))

	startGossip(node, JSON.stringify({data: postData}), (err, _data ) => {
		if (!_data) {
			return logger(Colors.magenta(`connectToGossipNode ${node.ip_addr} push ${_data} is null!`))
		}

		try {
			const data: listenClient = JSON.parse(_data)
			logger(inspect(data, false, 3, true))
			const validatorNode = getRandomNodeV2(index)
			// validator(response, profile, entryNode)
		} catch (ex) {
			logger(Colors.blue(`${node.ip_addr} => \n${_data}`))
			logger(Colors.red(`connectToGossipNode JSON.parse(_data) Error!`))
		}
	})
}

const start = (privateKeyArmor: string) => new Promise(async resolve => {
	const wallet = new ethers.Wallet(privateKeyArmor)
	const message  = JSON.stringify({walletAddress: wallet.address.toLowerCase()})
	const messageHash =  ethers.id(message)
	const signMessage = EthCrypto.sign(privateKeyArmor, messageHash)
	const sendData = {
		message, signMessage
	}
	connectToGossipNode(wallet)
})

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
	let first = true
	const kkk = requestHttps(option, res => {

		if (res.statusCode !==200) {
			setTimeout(() => {
				startTestMiner (url, POST, callback)
			}, 1000)
			
			return logger(`startTestMiner got res.statusCode = [${res.statusCode}] != 200 error! restart`)
		}

		let data = ''
		let _Time: NodeJS.Timeout
		res.on ('data', _data => {
			data += _data.toString()
			if (/\r\n\r\n/.test(data)) {
				clearTimeout(_Time)
				if (first) {
					first = false
					callback ('', data)
				}
				
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
		return startTestMiner (url, POST, callback)
	})

	kkk.end(POST)

}

const [,,...args] = process.argv
let _SRP = ''
let number = 1
let _start = 0
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
})

if ( _SRP && number > 0) {
	getWallet (_SRP, number, _start)
}