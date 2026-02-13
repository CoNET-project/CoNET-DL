import {ethers} from 'ethers'
import GuardianNodesV2ABI from './CGPNv7New.json'
import { logger } from '../util/util'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {mapLimit} from 'async'
import {readKey} from 'openpgp'
import Colors from 'colors/safe'
import newNodeInfoABI from './newNodeInfoABI.json'
import { masterSetup, checkSign} from '../util/util'
import {inspect} from 'node:util'

const CONET_Guardian_PlanV7 = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'.toLowerCase()
const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
const provider = new ethers.JsonRpcProvider('https://cancun-rpc.conet.network')

const GuardianNodesInfoV6_cancun = '0x88cBCc093344F2e1A6c2790A537574949D711E9d'
const GuardianNodesInfo = new ethers.Contract(GuardianNodesInfoV6_cancun, NodesInfoABI, provider)

const newNodeInfoAddr = '0xCd68C3FFFE403f9F26081807c77aB29a4DF6940D'
const GuardianNodesInfoManager = new ethers.Wallet(masterSetup.GuardianNodesInfoManager, CONET_MAINNET)
const newNodeInfoSC = new ethers.Contract(newNodeInfoAddr, newNodeInfoABI, GuardianNodesInfoManager)
const GuardianNodes = new ethers.Contract(CONET_Guardian_PlanV7, GuardianNodesV2ABI, provider)

let Guardian_Nodes: nodeInfo[] = []

const GuardianNodeInfo_mainnet = '0xCd68C3FFFE403f9F26081807c77aB29a4DF6940D'
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

const test = async () => {
    await getAllNodes()

}

test()