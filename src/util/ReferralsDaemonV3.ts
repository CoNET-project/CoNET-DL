import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {exec} from 'node:child_process'
import { inspect } from 'node:util'


const conet_Holesky_rpc = 'http://207.90.195.83:9999'


const startListeningCONET_Holesky_EPOCH = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)

	provideCONET.on('block', async block => {
		return startDaemonProcess(parseInt(block.toString()))

	})
}

const startDaemonProcess = async (block: number) => {
	console.log(block)
	doWorker((block -10).toString())
}

const doWorkerCom: (command: string) => Promise<boolean> = (command: string) => new Promise(resolve => {
	exec(command, (error, stdout, stderr) => {
		logger(stdout)
		logger(stderr)
		logger()
		return resolve (true)

	})
})

const doWorker = async (epoch: string) => {
	const command = `node dist/util/doEpochNode epoch=${epoch}`
	const command1 = `node dist/util/doEpoch epoch=${epoch}`
	logger(Color.red(`Start doWorker Epoch ${epoch}`))
	await Promise.all ([
		doWorkerCom(command),
		doWorkerCom(command1)
	])
	logger(Color.red(`doWorker Epoch ${epoch} Finished`))
}

startListeningCONET_Holesky_EPOCH()

