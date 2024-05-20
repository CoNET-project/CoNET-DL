import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {exec} from 'node:child_process'


const conet_Holesky_rpc = 'https://rpc.conet.network'


const startListeningCONET_Holesky_EPOCH = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)

	provideCONET.on('block', async block => {
		return startDaemonProcess(parseInt(block.toString()))
	})
}

const startDaemonProcess = async (block: number) => {
	console.log('')
	doWorker((block -3).toString())
}

const doWorkerCom: (command: string) => Promise<boolean> = (command: string) => new Promise(resolve => {
	exec(command, (error, stdout, stderr) => {
		const ret = stdout.split('ret=')[1]
		try{
			const ret1 = JSON.parse(ret)
			return resolve (true)
		} catch (ex) {
			logger(Color.red(`doEpochNode JSON.parse(ret) Error! ret=${ret}`))
		}
		return resolve (false)
	})
})

const doWorker = async (epoch: string) => {
	const command = `node dist/util/doEpochNode epoch=${epoch}`
	const command1 = `node dist/util/doEpoch epoch=${epoch}`
	await Promise.all ([
		doWorkerCom(command),
		doWorkerCom(command1)
	])
	logger(`doWorker Epoch ${epoch} Finished`)
}

startListeningCONET_Holesky_EPOCH()

