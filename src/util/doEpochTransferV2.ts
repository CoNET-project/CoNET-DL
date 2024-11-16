import {ethers} from 'ethers'

import {masterSetup} from './util'
import Color from 'colors/safe'
import { logger } from './logger'
import { join } from 'node:path'
import {readFile} from 'node:fs/promises'
import CNTP_Transfer_Manager from './CNTP_Transfer_pool'
import {inspect} from 'node:util'
import CONET_Point_ABI from './cCNTP.json'

const conet_Holesky_RPC = 'https://rpc.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)
const CNTP_Addr = '0xa4b389994A591735332A67f3561D60ce96409347'
const wallet = new ethers.Wallet(masterSetup.conetFaucetAdmin[1], provider)
const CNTP_SC = new ethers.Contract(CNTP_Addr, CONET_Point_ABI, wallet)
const CNTP_holder= '0x418833b70F882C833EF0F0Fcee3FB9d89C79d47C'
const localIPFS_path = '/home/peter/.data/v2/'

const getLocalIPFS = async (block: string) => {
	const path1 = join(localIPFS_path, `${block}.wallet`)
	const path2 = join(localIPFS_path, `${block}.total`)
	logger(Color.blue(`getLocalIPFS [${path1}] [${path2}]`))
	const [total, wallet] = await Promise.all([
		readFile(path2, 'utf8'),
		readFile(path1, 'utf8')
	])

	return {total, wallet}
}

interface ITotal {
	totalMiners: number
	minerRate: number
	totalUsrs: number
	epoch: number
}

const burnCNTP = async (valueCNTP: number) => {
	try {
		const tx = await CNTP_SC.burnFrom(CNTP_holder, ethers.parseEther(valueCNTP.toFixed(8)))
		const ts = await tx.wait()
		logger(inspect(ts, false, 3, true))
	} catch (ex: any) {
		return logger(Color.red(`burnCNTP Error!`), ex.message)
	}
}

const stratFreeMinerTransfer = async (block: number) => {

	const _data = await getLocalIPFS (block.toString())
	
	let walletArray: string[]
	let total: ITotal
	
	try{
		total = JSON.parse(_data.total)
		walletArray = JSON.parse(_data.wallet)
	} catch (ex) {
		logger(inspect(_data, false, 3, true))
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} JSON parse Error!`))
	}
	
	if (!walletArray.length) {
		logger(inspect(walletArray, false, 3, true))
		logger(inspect(total, false, 3, true))
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} Arraay is empty!`))
	}
	
	const minerRate = total.minerRate * 12
	const payArray = walletArray.map (n => parseFloat(minerRate.toFixed(6)))
	const brunCNTP = total.totalUsrs * minerRate
	console.error(Color.blue(`daemon EPOCH = [${block}] starting! rate minerRate = [${ minerRate }] MinerWallets length = [${walletArray.length}] users ${total.totalUsrs} brun CNTP = ${brunCNTP}`))
	CNTP_Transfer_Manager_freemining.addToPool(walletArray, payArray)
	await burnCNTP(brunCNTP)
}

let EPOCH = 0

const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	EPOCH = await provider.getBlockNumber()

	provider.on('block', async (_block: number) => {
		if (_block === EPOCH + 1) {
			stratFreeMinerTransfer(_block - 2)
			EPOCH ++
		}
	})
}

const CNTP_Transfer_Manager_freemining = new CNTP_Transfer_Manager(masterSetup.conetCNTPAdmin, 1000)
startListeningCONET_Holesky_EPOCH_v2()