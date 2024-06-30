import GuardianNodesV4 from '../util/GuardianNodesInfoV4.json'
import cGPNAbi from '../util/CGPNs.json'
import {ethers} from 'ethers'
import {mapLimit} from 'async'
import { logger } from '../util/logger' 
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import {tryConnect} from '../util/utilNew'

const CONETRpcProvider = new ethers.JsonRpcProvider('https://rpc.conet.network')
const cGPNAddr = '0x453701b80324C44366B34d167D40bcE2d67D6047'
const GuardianNodesV4Addr = '0x264ea87162463165101A500a6Bf8755b91220350'
const cGPNAddrSC = new ethers.Contract(cGPNAddr, cGPNAbi, CONETRpcProvider)
const GuardianNodesSC = new ethers.Contract(GuardianNodesV4Addr, GuardianNodesV4, CONETRpcProvider)



const getAllNodes = async () => {
	let nodeNumber: BigInt
	try {
		nodeNumber = await cGPNAddrSC.currentNodeID()
	} catch (ex) {
		return []
	}
	logger(Colors.magenta(`Total cGPN is ${nodeNumber.toString()}`))
	const processArray: number[] = []
	for (let i = 100; i < parseInt(nodeNumber.toString()); i ++ ) {
		processArray.push (i)
	}
	const nodes: string[] = []
	const addressMap = new Map ()
	const regionMap = new Map()
	const controy = new Map()
	await mapLimit(processArray, 4, async (n, next) => {
		const [ipaddress, regionName, pgp] = await GuardianNodesSC.getNodeInfoById(n)
		if (ipaddress) {
			nodes.push(ipaddress)
			const region: string = regionName.split('.')[1]
			addressMap.set(ipaddress, regionName)
			const reg = regionMap.get(regionName) || 0
			regionMap.set(regionName, reg + 1)
			const cny = controy.get(region) || 0
			controy.set(region, cny + 1)

			logger(Colors.blue(`mapLimit ${n} added ${ipaddress} [${regionName}] to nodes pool ${nodes.length} !`), JSON.stringify(Buffer.from(pgp,'base64').toString()))
		} else {
			next(new Error('end'))
		}
		
	}).catch(ex => {
		logger(Colors.red(`mapLimit catch EX`))
	})

	logger(Colors.magenta(`total nodes = ${nodes.length} address is ${addressMap.size}`))
	logger(inspect(controy.entries(), false, 3, true))
	logger(inspect(regionMap.entries(), false, 3, true))
	const execProcess: any [] = []
	nodes.forEach(n => {
		execProcess.push (tryConnect(n))
	})
	await mapLimit(execProcess, 10, async (n, next) => {
		await n
	})

}

const start = async () => {
	await getAllNodes()
}

start()