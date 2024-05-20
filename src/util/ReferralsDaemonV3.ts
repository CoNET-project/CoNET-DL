import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {inspect} from 'node:util'
import { mapLimit} from 'async'
import {GuardianNodes_ContractV2, masterSetup, cCNTP_Contract, conet_Referral_contractV2, mergeTransfersv1} from './util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'
import {exec} from 'node:child_process'

import {getMinerCount, storeLeaderboardGuardians_referrals, storeLeaderboardFree_referrals} from '../endpoint/help-database'
import {abi as CONET_Point_ABI} from './conet-point.json'
import {abi as CONET_Referral_ABI} from './conet-referral.json'

const conet_Holesky_rpc = 'https://rpc.conet.network'

import {transferPool, startTransfer} from './transferManager'

let EPOCH = 0
let transferEposh = 0



	let runningTransferEposh = 0




	const startListeningCONET_Holesky_EPOCH = async () => {
		const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
		EPOCH = await provideCONET.getBlockNumber()
		transferEposh = EPOCH - 3

		logger(Color.magenta(`startListeningCONET_Holesky_EPOCH [${EPOCH}] start!`))
		provideCONET.on('block', async block => {
			if (block <= EPOCH) {
				return logger(Color.red(`startListeningCONET_Holesky_EPOCH got Event ${block} < EPOCH ${EPOCH} Error! STOP!`))
			}
			return startDaemonProcess(parseInt(block.toString()))
		})
	}

	const startDaemonProcess = async (block: number) => {
		console.log('')
		EPOCH = block -3
		doWorker(EPOCH.toString())
	}

	const doWorker = (epoch: string) => new Promise(resolve => {
		const command = `node dist/util/CalculateReferrals epoch=${epoch}`
		return exec(command, (error, stdout, stderr) => {
			const ret = stdout.split('ret=')[1]
			try{
				const ret1 = JSON.parse(ret)
				return resolve (ret1)
			} catch (ex) {
				logger(Color.red(`doWorker JSON.parse(ret) Error! ret=${ret}`))
			}
			return resolve (null)
		})
	})

	startListeningCONET_Holesky_EPOCH()

