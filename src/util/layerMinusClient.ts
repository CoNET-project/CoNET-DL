//	gossip for mining

import {ethers} from 'ethers'
import Colors from 'colors/safe'
import {logger} from './logger'
import {inspect} from 'node:util'
import {RequestOptions, request } from 'node:http'
import {createMessage, encrypt, enums, readKey, Key} from 'openpgp'
import GuardianNodesV2ABI from '../endpoint/CGPNv7New.json'
import {mapLimit} from 'async'
import NodesInfo from '../endpoint/CONET_nodeInfo.ABI.json'
import {getRandomValues} from 'node:crypto'
import { writeFile} from 'node:fs/promises'

const conet_rpc = 'https://rpc.conet.network'

const GuardianNodesInfoV6 = '0x9e213e8B155eF24B466eFC09Bcde706ED23C537a'
const CONET_Guardian_PlanV7 = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'.toLowerCase()
const provoder = new ethers.JsonRpcProvider(conet_rpc)

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

			data += _data.toString()
			
			if (/\r\n\r\n/.test(data)) {
				clearTimeout(_Time)
				if (first) {
					first = false
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
			kkk.destroy()
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

let wallet: ethers.HDNodeWallet

interface listenClient {
	status: number
	epoch: number
	rate: string
	hash: string
	nodeWallet: string
	totalMiners: number
	connetingNodes: number
	nodeDomain: string
	nodeIpAddr: string
	nodeWallets: string []
}

interface IGossipStatus {
	totalConnectNode: number
	epoch: number
	nodesWallets: Map<string, string[]>
	totalMiners: number
	nodeWallets: string[]
}

let gossipStatus: IGossipStatus = {
	totalConnectNode: 0,
	epoch: 0,
	nodesWallets: new Map(),
	totalMiners: 0,
	nodeWallets: []
}

let previousGossipStatus = gossipStatus

const connectToGossipNode = async (node: nodeInfo ) => {
	
	
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
			const wallets = data.nodeWallets||[]

			const epochNode = listenPool.get(data.epoch)
			if (!epochNode) {
				if (data.epoch > currentEpoch) {
					const obj = new Map()
					obj.set(node.ip_addr, wallets)
					return listenPool.set (data.epoch, obj)
				}
				return logger(Colors.red(`${node.ip_addr} send unknow EPOCH ${data.epoch} data!`))
				
			}
			epochNode.set(node.ip_addr, wallets)
		} catch (ex) {
			logger(Colors.blue(`${node.ip_addr} => \n${_data}`))
			logger(Colors.red(`connectToGossipNode JSON.parse(_data) Error!`))
		}
	})
}
const filePath = '~/data/'
const moveData = async () => {
	const block = currentEpoch - 1
	logger(Colors.magenta(`move data at epoch ${block}`))
	let _wallets: string[] = []
	const obj = listenPool.get (block)
	if (!obj) {
		return logger(Colors.red(`moveData Error! listenPool hasn't Epoch ${block} data! `))
	}

	obj.forEach((v, keys) => {
		_wallets = [..._wallets, ...v]
	})

	
	logger(inspect(_wallets, false, 3, true))

	let totalMiners = _wallets.length
	previousGossipStatus.nodeWallets = _wallets
	previousGossipStatus.totalConnectNode = obj.size
	previousGossipStatus.totalMiners = totalMiners
	const filename = `${filePath}${block}.data`
	await writeFile(filename, JSON.stringify(previousGossipStatus))
	.catch(ex => {
		logger(Colors.red(`writeFile ${filename} error ${ex.message}`))
	})
	
}

const listenPool: Map<number, Map<string, string[]>> = new Map()
let currentEpoch = 0

const listenEpoch = async () => {
	currentEpoch = await provoder.getBlockNumber()
	gossipStatus.epoch = currentEpoch
	provoder.on('block', block => {
		currentEpoch = block
		moveData()
		listenPool.delete(currentEpoch - 3)
		const obj = listenPool.get (currentEpoch)
		if (!obj) {
			listenPool.set(currentEpoch, new Map())
		}
		
		logger(Colors.blue(`listenEpoch on [${currentEpoch}]`))
	})

	logger(Colors.blue(`listenEpoch start current = [${currentEpoch}]`))
}

interface nodeInfo {
	region: string
	ip_addr: string
	armoredPublicKey: string
	nftNumber: number
	domain: string
}

let getAllNodesProcess = false
let Guardian_Nodes: nodeInfo[] = []
const maxScanNodesNumber = 20

const getAllNodes = async () => {
	if (getAllNodesProcess) {
		return
	}
	getAllNodesProcess = true
	const GuardianNodes = new ethers.Contract(CONET_Guardian_PlanV7, GuardianNodesV2ABI, provoder)
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
	const GuardianNodesInfo = new ethers.Contract(GuardianNodesInfoV6, NodesInfo, provoder)

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

const startGossipListening = () => {
	if (!Guardian_Nodes.length) {
		return logger(Colors.red(`startGossipListening Error! gossipNodes is null!`))
	}
	logger(Colors.blue(`startGossipListening gossipNodes = ${Guardian_Nodes.length}`))

	Guardian_Nodes.forEach(n => {
		connectToGossipNode(n)
	})
	
}

const start = async () => {
	wallet = ethers.Wallet.createRandom()
	await getAllNodes()
	startGossipListening()
	listenEpoch()
}

start()