import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {exec} from 'node:child_process'


const conet_Holesky_rpc = 'https://rpc.conet.network'


let EPOCH = 0
let transferEposh = 0





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

