import {ethers} from 'ethers'
import GuardianNodesV2ABI from './GuardianNodesV2.json'
import { logger } from './logger'
import {masterSetup} from './util'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import {mapLimit} from 'async'
import NodesInfoABI_Holesky from '../endpoint/CONET_nodeInfo.ABI.json'
import NodesInfoABI_Cancun from './GuardNodeInfoCancunABI.json'
const conetHoleskyRPC = 'https://rpc.conet.network'
const GuardianNFT_holesky = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'
const GuardianNFT_Cancun = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'
const CONET_cancunRPC = 'https://cancun-rpc.conet.network'
const GuardNodeInfoAddr_Cancun = '0x88cBCc093344F2e1A6c2790A537574949D711E9d'

const conet_holesky = new ethers.JsonRpcProvider(conetHoleskyRPC)
const conet_Cancun = new ethers.JsonRpcProvider(CONET_cancunRPC)
const GuardianContract_holesky = new ethers.Contract(GuardianNFT_holesky, GuardianNodesV2ABI, conet_holesky)

const wallets: ethers.Wallet[]  = []
for (let i = 0; i < masterSetup.guardianAmin.length; i ++) {
	const adminWallet = new ethers.Wallet(masterSetup.guardianAmin[i], conet_Cancun)
	wallets.push (adminWallet)
}

const processWaitlingList: string[][] = []

const makewWait = () => new Promise(resolve=> {
	setTimeout(() => {
		return resolve(true)
	}, 1000)
})

const processAddNode = async () => {
	const walletArray = processWaitlingList.shift()
	if (!walletArray) {
		return logger(Colors.magenta(`processWaitlingList is empty!`))
	}

	const processWallet = wallets.shift()
	if (!processWallet) {
		processWaitlingList.push(walletArray)
		return logger(Colors.gray(`Have no processWallet can be use!`))
	}

	const Contract = new  ethers.Contract(GuardianNFT_Cancun, GuardianNodesV2ABI, processWallet)
	processAddNode()

	try {
		const tx = await Contract.mintNodeBatch(walletArray)
		await tx.wait()
		logger(Colors.blue(`added nodes ${walletArray.length} first is [${walletArray[0]}] `))
	} catch (ex: any) {
		logger(Colors.red(`Error ${ex.message}`))
	}
	wallets.push(processWallet)
	processAddNode()

}

const getALlBoostAddress = async () => {
	let boostersNumberArray: string[]
	[,, boostersNumberArray] = await GuardianContract_holesky.getAllIdOwnershipAndBooster()
	logger(inspect(boostersNumberArray, false, 3, true))
	const addressArray = boostersNumberArray.map(n => n)

}

const processmintBUYER_NFT = async () => {
	const referrer = ReferrerArray.shift()
	if (!referrer) {
		return //logger(Colors.gray(`processmintBUYER_NFT have no referrer!`))
	}

	const processWallet = wallets.shift()

	if (!processWallet) {
		ReferrerArray.push(referrer)
		return logger(Colors.gray(`Have no processWallet can be use!`))
	}
	const Contract = new ethers.Contract(GuardianNFT_Cancun, GuardianNodesV2ABI, processWallet)
	processmintBUYER_NFT()

	try {
		
		const tx = await Contract.mintREFERRER_NFT(referrer.address, referrer.value)
		await tx.wait()
		logger(Colors.blue(`added REFERRER NFT to ${referrer.address}: ${referrer.value}`))
	} catch (ex: any) {
		logger(Colors.red(`Error ${ex.message}`))
	}
	wallets.push(processWallet)
	processmintBUYER_NFT()

}

interface ReferreStruct {
	address: string
	value: number
}

const ReferrerArray: ReferreStruct[] = []

const adminList = [
	"0x379FAFb146d8BC51d035E34e9A8b37Fba2a9bf84",
	"0xeAE8F857bCcE758AfF3f9D53bAE79C353f79aAf4",
	"0x2125ee19468555fe10FcCa595824A56d2a0870E6",
	"0xCCfA8Dafd4343c7B8cb11c38F515a873c0DFcA92"
]
const addAdmin = () => {
	const adminWallet = new ethers.Wallet(masterSetup.guardianAmin[3], conet_Cancun)
	logger(`master wallet [${adminWallet.address}]`)
	const Contract = new  ethers.Contract(GuardianNFT_Cancun, GuardianNodesV2ABI, adminWallet)
	mapLimit(adminList, 1, async (n, next) => {
		await Contract.changeAddressInAdminlist(n, true)
	}, (err: any)=> {
		if (err) {
			logger(Colors.red(`addAdmin Error! ${err.message}`))
		} else {
			logger(Colors.blue(`addAdmin success!`))
		}
		
	})
}

const addNodeReferrerAddressBatch = async () => {
	let nodeReferrerAddressArray: string[]
	[, ,nodeReferrerAddressArray] = await GuardianContract_holesky.getAllIdOwnershipAndBooster()
	const addressArray = nodeReferrerAddressArray.map(n => n)
	const adminWallet = new ethers.Wallet(masterSetup.guardianAmin[3], conet_Cancun)
	const Contract = new  ethers.Contract(GuardianNFT_Cancun, GuardianNodesV2ABI, adminWallet)
	try {
		const tx = await Contract.nodeReferrerAddressBatch(addressArray)
		tx.wait()
		logger(Colors.blue(`addNodeReferrerAddressBatch success ${tx.hash}`))
	} catch(ex: any) {
		logger(ex.message)
	}
}

const addboostersNumber = async () => {
	let boostersNumberArray: string[]
	[, boostersNumberArray] = await GuardianContract_holesky.getAllIdOwnershipAndBooster()
	const adminWallet = new ethers.Wallet(masterSetup.guardianAmin[3], conet_Cancun)
	const Contract = new  ethers.Contract(GuardianNFT_Cancun, GuardianNodesV2ABI, adminWallet)
	const boosters = boostersNumberArray.map(n => n)
	await Contract.nodeIdBoosterBatch(boosters)
	logger(inspect(boostersNumberArray, false, 3, true))
}

const makenodeReferrer = async () => {
	let nodeReferrerAddressArray: string[]
	let referrerNodesNumber: string[]
	[, , nodeReferrerAddressArray, referrerNodesNumber] = await GuardianContract_holesky.getAllIdOwnershipAndBooster()
	const kk: Map<string, number> = new Map()
	nodeReferrerAddressArray.forEach(n => {
		if (n !== '0x0000000000000000000000000000000000000000') {
			let k = kk.get(n) || 0
			k++
			kk.set(n, k)
		}
		
	})

	kk.forEach((value, address) => {
		ReferrerArray.push ({
			address, value
		})
		processmintBUYER_NFT()
	})
	
}

const addNodes = async () => {
	let boostersNumberArray: string[]
	let nodeAddressArray: string[]
	let nodeReferrerAddressArray: string[]
	let referrerNodesNumber: string[]
	[nodeAddressArray, boostersNumberArray, nodeReferrerAddressArray, referrerNodesNumber] = await GuardianContract_holesky.getAllIdOwnershipAndBooster()
	const _allNodes = nodeAddressArray.map(n => n)

	const length = 200
	for (let i = 0; i < _allNodes.length; i += length) {
		
		const sub = _allNodes.slice(i, i + length)
		processWaitlingList.push (sub)
	}
	processAddNode()
}
const GuardianNodesInfoV6 = '0x9e213e8B155eF24B466eFC09Bcde706ED23C537a'.toLowerCase()
const GuardianNodesInfo_Holesky = new ethers.Contract(GuardianNodesInfoV6, NodesInfoABI_Holesky, conet_holesky)

const adminWallets: ethers.Contract[] = []
for (let i = 0; i < masterSetup.guardianAmin.length; i ++ ) {
	const wallet = new ethers.Wallet(masterSetup.guardianAmin[i], conet_Cancun)
	const Contract_Cancun = new ethers.Contract(GuardNodeInfoAddr_Cancun, NodesInfoABI_Cancun, wallet)
	adminWallets.push(Contract_Cancun)
}

const getNodeInfo = (nodeID: number) => new Promise(async resolve=> {
	let ret = true
	const adminContract = adminWallets.shift()
	if (!adminContract) {
		return setTimeout(() => {
			resolve (getNodeInfo(nodeID))
		}, 1000)
	}
	
	try {
		const nodeInfo = await GuardianNodesInfo_Holesky.getNodeInfoById(nodeID)
		if (nodeInfo.ipaddress) {
			const tx = await adminContract.modify_nodes(nodeID, nodeInfo.ipaddress, nodeInfo.regionName, nodeInfo.pgp )
			await tx.wait()
			logger(Colors.blue(`modify_nodes [${nodeID}] => [${nodeInfo.ipaddress}] Success!`))
		} else {
			ret = false
		}
		
	} catch (ex: any) {
		logger(Colors.red(`getNodeInfo Error! ${ex.message}`))
		ret = false
	}
	adminWallets.push(adminContract)
	resolve(ret)
})

const initGuardNodeInfo = async () => {
	const maxNodes = await GuardianContract_holesky.currentNodeID()
	const scanNodes = parseInt(maxNodes.toString())
	const nodes = []
	for (let i = 100; i < scanNodes; i ++) {
		nodes.push (i)
	}

	mapLimit(nodes, masterSetup.guardianAmin.length, async (n, next) => {
		const ret = await getNodeInfo(n)
		if (!ret) {
			throw (new Error('success!'))
		}
	}, err => {
		logger(Colors.magenta(`All success!`))
	})
}
initGuardNodeInfo()