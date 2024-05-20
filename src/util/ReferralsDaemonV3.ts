import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {exec} from 'node:child_process'
import { inspect } from 'node:util'


const conet_Holesky_rpc = 'https://rpc.conet.network'


const startListeningCONET_Holesky_EPOCH = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const curretnBlock = await provideCONET.getBlockNumber()
	checkBlockEvent (572442, provideCONET)
	// provideCONET.on('block', async block => {
	// 	checkBlockEvent (block, provideCONET)
	// 	return startDaemonProcess(parseInt(block.toString()))

	// })
}

const ReferralsV2Addr = '0x64Cab6D2217c665730e330a78be85a070e4706E7'.toLowerCase()
const detailTransfer = async (transferHash: string, provider: ethers.JsonRpcProvider) => {
	const transObj = await provider.getTransactionReceipt(transferHash)
	const toAddr = transObj?.to
	if ( toAddr && toAddr.toLowerCase() === ReferralsV2Addr) {
		
		const from = transObj.from
		logger(Color.grey(`ReferralsV2Addr has event! from ${from}`))
	}
}


const checkBlockEvent = async (block: number, provider: ethers.JsonRpcProvider) => {
	const blockDetail = await provider.getBlock(block)
	if (!blockDetail?.transactions) {
		return logger(Color.gray(`Block ${block} hasn't transactions SKIP!`))
	}

	for (let u of blockDetail.transactions) {
		await detailTransfer(u, provider)
	}

}

const startDaemonProcess = async (block: number) => {
	console.log(block)
	// doWorker((block -3).toString())
}

const doWorkerCom: (command: string) => Promise<boolean> = (command: string) => new Promise(resolve => {
	exec(command, (error, stdout, stderr) => {
		
		logger(stderr)
		return resolve (true)

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

