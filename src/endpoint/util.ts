import {ethers} from 'ethers'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import cCNTPAbi from '../util/cCNTP.json'
import { logger, conet_Holesky_rpc } from '../util/util'
import rateABI from './conet-rate.json'
import Colors from 'colors/safe'
const setup = join( homedir(),'.master.json' )

const CONET_Holesky_RPC = new ethers.JsonRpcProvider(conet_Holesky_rpc)

const masterSetup: ICoNET_DL_masterSetup = require ( setup )

const Claimable_CONET_Point_addr = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'
const cntpV1_new_chain = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'.toLowerCase()
export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[0])
const sendCNTP_v2_New_ChainContract = new ethers.Contract(cntpV1_new_chain, cCNTPAbi, CONET_Holesky_RPC)



const rateAddr = '0x9C845d9a9565DBb04115EbeDA788C6536c405cA1'.toLowerCase()
const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
const rateSC = new ethers.Contract(rateAddr, rateABI, provideCONET)


const checkTransfer = async (tx: string, rateBack: (rate: number) => void) => {
	const transObj = await provideCONET.getTransaction(tx)
	const toAddr = transObj?.to?.toLowerCase()
	if (!toAddr || toAddr !== rateAddr) {
		return
	}
	
	const rate = await rateSC.rate()
	logger(Colors.grey(`rateAddr fired! [${tx}] rate = [${ethers.formatEther(rate)}]`))
	return rateBack (rate)

}

const listenRateChange = async (block: number, rateBack: (rate: number) => void) => {
	const blockInfo = await provideCONET.getBlock(block)
	const transferArray = blockInfo?.transactions
	if (! transferArray) {
		return
	}
	const execArray: any[] = []
	transferArray.forEach(n => {
		execArray.push (checkTransfer(n, rateBack))
	})
	await Promise.all([
		...execArray
	])
}

export const listeningRate = async (rateBack: (rate: number) => void) => {
	
	provideCONET.on('block', async block => {
		listenRateChange(block, rateBack)
	})
	const rate = await rateSC.rate()
	const currentBlock = await provideCONET.getBlockNumber()
	logger(Colors.grey(`startListeningCONET_Holesky_EPOCH_v2 epoch [${currentBlock}] rate = [${ethers.formatEther(rate)}]!`))
}

// const testRate = async () => {
// 	const rate = await rateSC.rate()
// 	const totalMiner = BigInt(1500)
// 	const epochrate = rate/totalMiner
// 	logger(Colors.magenta(`epochrate = ${ethers.formatEther(epochrate)}`))
// }

// testRate()