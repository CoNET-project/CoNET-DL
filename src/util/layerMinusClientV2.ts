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
import rateABI from '../endpoint/conet-rate.json'
import NodesInfoABI from '../endpoint/CONET_nodeInfo.ABI.json'
import {masterSetup} from './util'
import faucet_v3_ABI from '../endpoint/faucet_v3.abi.json'
import CONETPassportABI from './CoNET_Cancun_passportABI.json'
const conet_rpc = 'https://cancun-rpc.conet.network'
import newNodeInfoABI from '../endpoint/newNodeInfoABI.json'

const GuardianNodesInfoV6_cancun = '0x88cBCc093344F2e1A6c2790A537574949D711E9d'
const CONET_Guardian_cancun = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'.toLowerCase()


const launchMap: Map<string, boolean> = new Map()
const epochTotal: Map<string, number> = new Map()

const faucetV3_cancun_Addr = `0x8433Fcab26d4840777c9e23dC13aCC0652eE9F90`
const CoNET_passport_addr = '0xEa6356BcE3E1264C03C93CBa668BB486765a46BA'
const CoNET_passport_SC: ethers.Contract[] = []

const getFaucet = async (nodeWallets: string[], ipAddress: string[]) => {


	const faucet_v3_Contract = new ethers.Contract(faucetV3_cancun_Addr, faucet_v3_ABI, wallet)
	logger(inspect(wallet))
	logger(inspect(ipAddress))
	try {
		const tx = await faucet_v3_Contract.getFaucet(nodeWallets, ipAddress)
		await tx.wait()
		logger(Colors.blue(`getFaucet for all nodes success ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`getFaucet error! ${ex.message}`))
	}

}

const addNodeToPassportPool: string[] = []
const didToPassportPool: Map<string, boolean> = new Map()
const PassportPoolProcess = async () => {
	const node = addNodeToPassportPool.shift()
	if (!node) {
		return
	}
	const sc = CoNET_passport_SC.shift()
	if (!sc) {
		addNodeToPassportPool.unshift(node)
		return
	}
	try {
		const isAd = await sc._guardianList(node)
		if (!isAd) {
			const tx = await sc.changeAddressInGuardianList(node, true)
			await tx.wait()
			logger(Colors.magenta(`PassportPoolProcess ${node} waiting list = [${addNodeToPassportPool.length}] success! `))
		}
		
		
	} catch(ex:any) {
		logger(Colors.red(`PassportPoolProcess Error, $${ex.message}`))
	}
	CoNET_passport_SC.unshift(sc)
	PassportPoolProcess()
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

		let data = ''
		let _Time: NodeJS.Timeout
		launchMap.set(connectHash, false)

		if (res.statusCode !==200) {
			relaunch()
			return logger(`startGossip ${node.ip_addr}:${node.domain} got statusCode = [${res.statusCode}] != 200 error! relaunch !!!`)
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
					kkk.destroy()
					relaunch()
				}, 24 * 1000)
			}
		})

		res.once('error', err => {
			relaunch()
			logger(Colors.red(`startGossip [${node.ip_addr}] res on ERROR! Try to restart! `), err.message)
		})

		res.once('end', () => {

			kkk.destroy()
			if (typeof callback === 'function') {
				logger(Colors.red(`startGossip [${node.ip_addr}] res on END! Try to restart! `))
				relaunch()
			}
			
		})
		
	})

	kkk.on('error', err => {
		logger(Colors.red(`startGossip on('error') [${node.ip_addr}] requestHttps on Error! no call relaunch`), err.message)
	})

	kkk.end(POST)

}

let wallet: ethers.HDNodeWallet

const postLocalhost = (path: string, obj: any)=> new Promise(async resolve =>{
	
	const option: RequestOptions = {
		hostname: 'localhost',
		path,
		port: 8004,
		method: 'POST',
		protocol: 'http:',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const req = await request (option, res => {
		if (res.statusCode !== 200) {
			logger(Colors.red(`postLocalhost http://localhost/${path} Error!!!`))
			return resolve(false)
		}
		resolve(true)
		//return logger(Colors.grey(`postLocalhost http://localhost/${path} Success!!!`),inspect(obj, false, 3, true))

	})

	req.once('error', (e) => {
		console.error(`postLocalhost to master on Error! ${e.message}`)

	})

	req.write(JSON.stringify(obj))
	req.end()
})

let sendCount = 0
let epoch = 0
let faucetProcess = false
let  PassportPoolProcessCount = 0
const nodeDate: Map<string, string> = new Map()

const connectToGossipNode = async (node: nodeInfo ) => {
	const walletAddress = wallet.address.toLowerCase()
	
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
	logger(Colors.blue(`connectToGossipNode ${node.domain}:${node.ip_addr}`))
	
	startGossip(node.ip_addr + walletAddress, node, JSON.stringify({data: postData}), async (err, _data ) => {
		if (!_data) {
			return logger(Colors.magenta(`connectToGossipNode ${node.ip_addr} push ${_data} is null!`))
		}

		try {
			const data: listenClient = JSON.parse(_data)
			
			const wallets = data.nodeWallets||[]
			const users = data.userWallets||[]
			node.lastEposh =  data.epoch

			const messageVa = {epoch: data.epoch.toString(), wallet: walletAddress}
			const nodeWallet = ethers.verifyMessage(JSON.stringify(messageVa), data.hash).toLowerCase()

			if (nodeWallet !== data.nodeWallet.toLowerCase()) {
				return logger(Colors.red(`${node.ip_addr} validatorMining verifyMessage hash Error! nodeWallet ${nodeWallet} !== validatorData.nodeWallet.toLowerCase() ${data.nodeWallet.toLowerCase()}`))
			}

			let total = epochTotal.get (data.epoch.toString())||0

			if (!total) {
				logger(`******************************************* didResponseNode Total send to local ${sendCount}`, inspect(didResponseNode, false, 3, true), '*******************************************')
				didResponseNode = JSON.parse(JSON.stringify(allNodeAddr))
				// if (!faucetProcess && nodeDate.size == _end - _start) {
				// 	logger(Colors.magenta(`Start node getFaucet for all node ${nodeDate.size}`))
				// 	faucetProcess = true
				// 	const _wallets: string[] = []
				// 	const ipaddress: string[] = []
				// 	nodeDate.forEach((v, key) => {
				// 		ipaddress.push(key)
				// 		_wallets.push(v)
				// 	})
				// 	getFaucet(_wallets, ipaddress)

				// } else{
				// 	logger(Colors.magenta(`nodes = ${nodeDate.size}`))
				// }

			}
			const index = didResponseNode.findIndex(n => n ===node.ip_addr)
			didResponseNode.splice(index, 1)
			epochTotal.set(data.epoch.toString(), total +1 )
			if (epoch != data.epoch) {
				epoch = data.epoch
				sendCount = 0
			}
			sendCount ++
			let kk = null
			if (postLocal) {
				kk = await postLocalhost('/api/miningData', {wallets, users, ipaddress: node.ip_addr, epoch: data.epoch, nodeWallet: nodeWallet})
			}
			// nodeDate.set(node.ip_addr, data.nodeWallet)
			// const didU = didToPassportPool.get(data.nodeWallet)
			// if (!didU) {
			// 	didToPassportPool.set (data.nodeWallet, true)
			// 	addNodeToPassportPool.push(data.nodeWallet)
			// 	PassportPoolProcessCount ++
			// 	PassportPoolProcess()
			// }

			logger(Colors.grey(`PassportPoolProcessCount = [${PassportPoolProcessCount}]startGossip got EPOCH ${data.epoch} [${node.ip_addr}:${data.nodeWallet}] Total nodes ${total +1} miners ${data.nodeWallets.length} users ${data.userWallets.length} ${kk ? ' sendLocalhost count ' + sendCount + 'SUCCESS' : ''}`))
		} catch (ex) {
			logger(Colors.blue(`${node.ip_addr} => \n${_data}`))
			logger(Colors.red(`connectToGossipNode ${node.ip_addr} JSON.parse(_data) Error!`))
		}
	})
}


let didResponseNode: string[] = []


const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'.toLowerCase()
const filePath = '/home/peter/.data/v2/'



const listenPool: Map<number, Map<string, string[]>> = new Map()
const userPool: Map<number, Map<string, string[]>> = new Map()

let currentEpoch = 0
const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
let getAllNodesProcess = false
let Guardian_Nodes: nodeInfo[] = []
const GuardianNodeInfo_mainnet = '0x2DF3302d0c9aC19BE01Ee08ce3DDA841BdcF6F03'
const GuardianNodesMainnet = new ethers.Contract(GuardianNodeInfo_mainnet, newNodeInfoABI, CONET_MAINNET)

const getAllNodes = () => new Promise(async resolve=> {

    const _nodes = await GuardianNodesMainnet.getAllNodes(0, 1000)
    for (let i = 0; i < _nodes.length; i ++) {
        const node = _nodes[i]
        const id = parseInt(node[0].toString())
        const pgpString: string = Buffer.from( node[1], 'base64').toString()
        const domain: string = node[2]
        const ipAddr: string = node[3]
        const region: string = node[4]
        const itemNode: nodeInfo = {
            ip_addr: ipAddr,
            armoredPublicKey: pgpString,
            domain: domain,
            nftNumber: id,
            region: region
        }
    
        Guardian_Nodes.push(itemNode)
    }
    logger(Colors.red(`mapLimit catch ex! Guardian_Nodes = ${Guardian_Nodes.length} `))
    resolve(true)
})

let allNodeAddr: string[] = []
const startGossipListening = () => {
	if (!Guardian_Nodes.length) {
		return logger(Colors.red(`startGossipListening Error! gossipNodes is null!`))
	}

	logger(Colors.blue(`startGossipListening gossipNodes = ${Guardian_Nodes.length}`))
	
	Guardian_Nodes.forEach(n => {
		allNodeAddr.push (n.ip_addr)
		connectToGossipNode(n)
	})
	
}

const start = async () => {
	logger(Colors.blue(`Layer Minus listenning V2 start from (${_start}) to (${_end})`))
	wallet = ethers.Wallet.createRandom()
	await getAllNodes()
	startGossipListening()
	managerWallet = Math.round(_start / 100)

	const _wa = new ethers.Wallet(masterSetup.LayerMinus[managerWallet], CONET_MAINNET)
	const sc = new ethers.Contract(CoNET_passport_addr, CONETPassportABI, _wa)
	CoNET_passport_SC.push(sc)
}


const [,,...args] = process.argv
let _start = 0
let _end = 1
let postLocal = true
let managerWallet = 0
args.forEach ((n, index ) => {
	if (/^N\=/i.test(n)) {
		_end = parseInt(n.split('=')[1])
	}

	if (/^P/i.test(n)) {
		postLocal = false
	}

	if (/^S\=/i.test(n)) {
		_start = parseInt(n.split('=')[1])
	}
})

if (_end - _start > 0) {
	start()
}