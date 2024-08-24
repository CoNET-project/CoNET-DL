import {ethers} from 'ethers'

import {masterSetup, getIPFSfile, mergeTransfersv1} from './util'
import Color from 'colors/safe'
import { logger } from './logger'
import {mapLimit} from 'async'
import {homedir} from 'node:os'
import { join } from 'node:path'
import {readFile} from 'node:fs'
import CNTP_Transfer_Manager from './CNTP_Transfer_pool'

import rateABI from '../endpoint/conet-rate.json'

const conet_Holesky_RPC = 'https://rpc.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)
const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'.toLowerCase()


const localIPFS_path = join(homedir(), '.data')
const getLocalIPFS: (block: string) => Promise<string> = (block: string) => new Promise(resolve => {
	const path = join(localIPFS_path, `free_wallets_${block}`)

	return readFile(path, 'utf-8', (err, data) => {
		if (err) {
			return resolve ('')
		}
		return resolve(data.toString())
	})
})	


const stratFreeMinerTransfer = async (block: number) => {

	const data = await getLocalIPFS (block.toString())
	
	if (!data) {
		return logger(Color.red(`stratFreeMinerReferrals get EPOCH ${block} free_wallets_${block} error!`))
	}
	
	let walletArray: string[]
	
	try{
		walletArray = JSON.parse(data)
	} catch (ex) {
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} JSON parse Error!`))
	}
	
	if (!walletArray?.length) {
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} Arraay is empty!`))
	}
	
	const rateSC = new ethers.Contract(rateAddr, rateABI, provider)
	const rate = parseFloat(ethers.formatEther(await rateSC.rate()))
	const minerRate = rate/walletArray.length
	const payArray = walletArray.map (n => parseFloat(minerRate.toFixed(6)))
	console.error(Color.blue(`daemon EPOCH = [${block}] starting! rate [${rate}] minerRate = [${ minerRate }]MinerWallets length = [${walletArray.length}]`))
	CNTP_Transfer_Manager_freemining.addToPool(walletArray, payArray)
	
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
const CNTP_Transfer_Manager_freemining = new CNTP_Transfer_Manager(masterSetup.conetCNTPAdmin, 700)
startListeningCONET_Holesky_EPOCH_v2()