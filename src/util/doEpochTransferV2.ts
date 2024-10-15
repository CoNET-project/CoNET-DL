import {ethers} from 'ethers'

import {masterSetup} from './util'
import Color from 'colors/safe'
import { logger } from './logger'
import { join } from 'node:path'
import {readFile} from 'node:fs/promises'
import CNTP_Transfer_Manager from './CNTP_Transfer_pool'
import {inspect} from 'node:util'
import rateABI from '../endpoint/conet-rate.json'

const conet_Holesky_RPC = 'https://rpc.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)
const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'.toLowerCase()


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
	

	
	const minerRate = total.minerRate
	const payArray = walletArray.map (n => parseFloat(minerRate.toFixed(6)))
	console.error(Color.blue(`daemon EPOCH = [${block}] starting! rate minerRate = [${ minerRate }] MinerWallets length = [${walletArray.length}] users ${total.totalUsrs}`))
	// CNTP_Transfer_Manager_freemining.addToPool(walletArray, payArray)
	
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