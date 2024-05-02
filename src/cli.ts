#!/usr/bin/env node
import { join } from 'node:path'
import { inspect } from 'node:util'
import { exec } from 'node:child_process'
import { logger, getServerIPV4Address, saveSetup, getSetup, getCNTPMastersBalance, mergeTransfers, loadWalletAddress, multiTransfer_original_Blast, startPackageSelfVersionCheckAndUpgrade, generatePgpKeyInit, splitPei, sendTokenToMiner, multiTransfer,free_Pei, nodesWalletAddr, listedServerIpAddress, sendCONET, checkReferralSign } from './util/util'
import {daemons} from './endpoint/daemon'
//import {streamCoNET_USDCPrice} from './endpoint/help-database'

import conet_dl_server from './endpoint/server'
import Cluster from 'node:cluster'
import type { Worker } from 'node:cluster'
import Colors from 'colors/safe'
import { homedir, cpus } from 'node:os'



const ReserveIPAddress=['74.208.25.159','74.208.151.98','108.175.5.112','209.209.8.74']

const eraseNodeOnlieTime = 1000 * 60 * 6

let debug = false
let version = false
let start = false
let help = false
let passwd = ''
let daemon = false
let workerPool: Worker[] = []
let single = false
let node_si_pool: nodeType[] = []
let livenessStart = false
let sending_CONET = false
let sendMineFromMinerPool_processing = false
const [,,...args] = process.argv
args.forEach ((n, index ) => {
	if (/\-debug/.test(n)) {
		debug = true
	} else if ( /\-v| \--version/.test (n)) {
		version = true
	} else if  (/\-start/.test (n)) {
		start = true
	} else if (/\-h|\--help/.test (n)) {
		help = true
	} else if (/\-p/.test(n)) {
		passwd = args[index + 1]
	} else if (/\-d/.test(n)) {
		daemon = true
	}
	else if (/\-s/.test(n)) {
		single = true
	}
})


const _forkWorker = (onMessage: (message: clusterMessage, fork: Worker)=> void = ()=>{}) => {
	const fork = Cluster.fork ()
	if ( !/^\(\)\s=>\s\{\s\}/.test(onMessage.toString())) {
		fork.on ('message', msg => onMessage(msg, fork) )
	}
	

	fork.once ('exit', (code: number, signal: string) => {
		
		if ( signal === null ) {
			return logger (`Worker [${ fork.id }] EXIT with code [${code}] signal = null do not restart!`)
		}

		logger (Colors.red(`Worker [${ fork.id }] Exit with code[${ code }] signal[${ signal }]!\n Restart after 30 seconds!`))
		return setTimeout (() => {
			return _forkWorker (onMessage)
		}, 1000 * 10)
	})
	return (fork)
}
if ( Cluster.isPrimary) {
	const DL_Path = '.CoNET-DL'
	const setupFileDir = join ( homedir(), DL_Path )
	const setupFileName = join ( setupFileDir, 'nodeSetup.json')
	const setupFile = join( homedir(),'.master.json' )
	const masterSetup: ICoNET_DL_masterSetup = require ( setupFile )
	const startCommand = `conet-mvp-dl start > system.log &`
	const livenessListeningPool:Map<string, minerObj> = new Map()



	const sendMinerPool: sendMiner[] = []
	const debugWhiteList = ['207.216.58.151', '104.152.209.34']
	

	let masterBalance: {
		CNTPMasterBalance: string
		CNTPReferralBalance: string
	}|null
	const ipaddressPool: Map<string, number[]>  = new Map()
	const sendCONET_Pool: string[] = []
	const ReferralsMap: Map<string, string> = new Map()

	const nonceLock: nonceLock = {
		conetPointAdmin: false,
		cnptReferralAdmin: false,
		blastConetPointAdmin: false,
		blastcnptReferralAdmin: false
	}

	const timeoutPool: {
		timeout: NodeJS.Timeout
		ip_addr: string
	}[] = []
	const killAllWorker = () => {
		if ( workerPool.length > 0) {
			for (let i = 0; i < workerPool.length; i ++) {
				const worker = workerPool[i]
				worker.kill ()
			}
		}
	}
	const sendDataLength = 35

	const sendMineFromMinerPool = async () => {
		if (sendMineFromMinerPool_processing) {
			return
		}
		const data = sendMinerPool.shift()
		if (!data) {
			return logger(Colors.magenta(`sendMineFromMinerPool got null from pool, stop process!`))
		}

		
		sendMineFromMinerPool_processing = true
		
		await multiTransfer (masterSetup.cnptReferralAdmin, data.referrals.walletList, data.referrals.payList, nonceLock )

		
		//await multiTransfer_original_Blast(masterSetup.cnptReferralAdmin, data.referrals.walletList, data.referrals.payList, nonceLock)
		let keep = true
		while(keep) {
			const addressList: string[] = []
			const payList: string[] = []
			for (let l = 0; l < sendDataLength; l ++) {
				
				const add = data.miner.walletList.shift()
				const pay = data.miner.payList.shift()
				if (!add||!pay) {
					keep = false
					break
				}
				addressList.push(add)
				payList.push(pay)
			}
			if (addressList.length) {
				await multiTransfer_original_Blast(masterSetup.conetPointAdmin, addressList, payList, nonceLock )
				await sendTokenToMiner (addressList, payList, masterSetup.conetPointAdmin, nonceLock)
			}
		}
		

		sendMineFromMinerPool_processing = false
		sendMineFromMinerPool ()
	}


	const packageFile = join (__dirname, '..', 'package.json')
	debug ? logger (`packageFile = ${ packageFile }`): null
	const setup = require ( packageFile )
	const printVersion = () => {
		logger (`CoNET-DL node version ${ setup.version }\n` )
		process.exit (0)
	}
	
	const printInfo = () => {
		logger (
			`CoNET-DL CLI ${ setup.version } is a command line tool that gives CoNET-DL participant who provides maining to earn coin\n` +
			`Usage:\n`+
			`	conet-mvp-dl [command]\n\n` +
			`CoNET-DL CLI Commands:\n` +
			`	node start|stop			Manage node \n` +
			`\n` +
			`Flags:\n` +
			`-v, --version            version for CoNET-DL CLI` +
			``
		)
	
		process.exit (0)
	}

	
	if ( version ) {
		printVersion ()
		process.exit()
	}
	
	if ( !args[0] || help ) {
		printInfo ()
		process.exit()
	}
	
	const GlobalIpAddress = getServerIPV4Address ( false )
	
	debug? logger (inspect (GlobalIpAddress, false, 3, true )) : null
	
	if ( GlobalIpAddress.length === 0 ) {
		logger ('WARING: Your node looks have no Global IP address!')
	}

	const startPackageSelfVersionCheckAndUpgrade_IntervalTime = 1000 * 60 * 3				//			10 mins

	const checkNewVer = async () => {
		const haveNewVersion = await startPackageSelfVersionCheckAndUpgrade('@conet.project/mvp-dl')
		if ( haveNewVersion === null ) {
			return logger (Colors.red(`startPackageSelfVersionCheckAndUpgrade responsed null! Interval exec STOP!`))
		}
		if ( haveNewVersion === true ) {
			logger (Colors.red (`@conet.project/mvp-dl had UPGRADE new!, restart all!`))
			killAllWorker()
			return process.exit ()
		}

		setTimeout (() => {
			checkNewVer ()
		}, startPackageSelfVersionCheckAndUpgrade_IntervalTime)
	}

	const tryMaster_json_file = async (setupInfo: ICoNET_NodeSetup) => {
		
	
		const obj = loadWalletAddress (setupInfo.keychain)

		const streamCoNET_USDCPriceQuere: any[] = []

		if (!setupInfo.pgpKeyObj) {
			setupInfo.pgpKeyObj = await generatePgpKeyInit ( setupInfo.keychain[0].address)
			await saveSetup ( setupFileName, JSON.stringify (setupInfo))
		}

		single ? new conet_dl_server () : forkWorker ()
		//streamCoNET_USDCPrice (streamCoNET_USDCPriceQuere)
		return checkNewVer()

	}

	const reflashMasterBalance = async () => {
		masterBalance = await getCNTPMastersBalance(masterSetup.conetPointAdmin)
		setTimeout(() => {
			return reflashMasterBalance()
		}, 30000)
	}

	const getSetupInfo = async () => {

		let setupInfo: ICoNET_NodeSetup|null = await getSetup ( debug )
	
		if ( !setupInfo ) {
			logger(Colors.blue(`function getSetup return null!`))
			//const password = await waitKeyInput (`Please enter the password for protected wallet address: `, true )

			const port: number = 4001
	


			setupInfo = {
				keychain:'',
				ipV4: GlobalIpAddress[0],
				ipV6: '',
				ipV4Port: port,
				ipV6Port: port,
				setupPath: '',
				pgpKeyObj: await generatePgpKeyInit(''),
				keyObj: null
			}
			
			await saveSetup ( setupFileName, JSON.stringify (setupInfo))
			return tryMaster_json_file (setupInfo)
		}
		logger(Colors.blue(`function getSetupFinished`))
		//masterBalance = await getCNTPMastersBalance(masterSetup.conetPointAdmin)

		logger(Colors.blue(`function getSetup return null!`))
		return tryMaster_json_file (setupInfo)
		
	}

	const broadcastNodelistToAllWorkers = () => {
		const mess: clusterMessage = {
			cmd: 'si-node',
			data: [node_si_pool],
			uuid:'',
			err: null
		}
		
		return workerPool.forEach (v => {
			if ( v.isConnected()) {
				v.send (mess)
			}
		})
	}

	const broadcastStartlivenessMiner = async (blockNumber: number) => {
		
		const mess: clusterMessage = {
			cmd: 'livenessStart',
			data: [node_si_pool, blockNumber, livenessListeningPool.size, free_Pei],
			uuid: '',
			err: null
		}
		logger(Colors.magenta(`broadcastStartlivenessMiner to all servers!`))
		return workerPool.forEach (v => {
			if ( v.isConnected()) {
				v.send (mess)
			}
		})
	}

	const sendStopToWork = async (obj: minerObj) => {
		
		const mess: clusterMessage = {
			cmd: 'stop-liveness',
			data: [obj],
			uuid: '',
			err: null
		}
		return obj.fork.send(mess)
	}

	const FaucetCount = '0.01'

	const _sendCONET = async () => {
		if (sending_CONET) {
			return
		}
		const wallet = sendCONET_Pool.shift()
		if (!wallet) {
			return
		}

		sending_CONET = true

		await sendCONET(masterSetup.conetFaucetAdmin, FaucetCount, wallet)
		sending_CONET = false
		_sendCONET ()
		return
	}

	const addToSiPool = (data: any) => {
		const newPool = node_si_pool.filter (v => v.ip_addr !== data.ip_addr)
		newPool.unshift(data)
		const timeIndex = timeoutPool.findIndex(n => n.ip_addr === data.ip_addr)

		if (timeIndex > -1) {
			const time_out = timeoutPool[timeIndex]
			clearTimeout (time_out.timeout)
			timeoutPool.splice(timeIndex, 1)
		}

		const timeout = setTimeout (() => {
			const index = node_si_pool.findIndex (n => n.ip_addr === data.ip_addr)
			if ( index > -1) {
				const node= node_si_pool[index]
				node.running = false
				logger (Colors.red(`Erase node daemon! Erase node[${data.ip_addr}]`))
				return broadcastNodelistToAllWorkers ()
			}
			return logger (`eraseNodeOnlie daemon Error! can't find the node information from pool!\n`, inspect(data, false, 3, true ))
		}, eraseNodeOnlieTime)

		node_si_pool = newPool
		timeoutPool.push ({
			timeout,
			ip_addr: data.ip_addr
		})
		logger (Colors.bgYellow(`${data.ip_addr} `), Colors.grey (` to master pool [${node_si_pool.length}]!`))
		return broadcastNodelistToAllWorkers()
		
	}

	const mergePool = (data: sendMiner) => {
		
		const merge = sendMinerPool.shift()
		if (merge) {
			const merge1 = {miner: mergeTransfers([...merge.miner.walletList, ...data.miner.walletList], [...merge.miner.payList, ...data.miner.payList]), 
				referrals: mergeTransfers([...merge.referrals.walletList, ...data.referrals.walletList],[...merge.referrals.payList, ...data.referrals.payList])}
			mergePool (merge1)
			return
		}
		sendMinerPool.push(data)
		sendMineFromMinerPool()
	}

	const onMessage = async (message: clusterMessage, fork: Worker) => {
		switch (message.cmd) {
			case 'si-node': {
				const node: nodeType = message.data[0]
				
					const _index = listedServerIpAddress.findIndex(nn => {
						return nn.ipaddress === node.ip_addr
					})
					if (_index < 0){
						return logger(Colors.red(`new SI node ${node.ip_addr} Join to  listedServerIpAddress!`))
					}
					node.minerAddr = listedServerIpAddress[_index].wallet_addr
					node.running = true
					node.type = listedServerIpAddress[_index].type
					// const data = await getWalletBalance(masterSetup.conetPointAdmin, node.minerAddr, ReferralsMap)
					// if (data) {
					// 	node.balance = data?.CNTP_Balance
					// }
					// logger(inspect(node, false, 3, true))
					return addToSiPool (node)
				
				
			}

			case 'newBlock': {
				const blockNumber = message.data[0]
				const soingMint = (parseInt(blockNumber) %2) > 0
				if (!soingMint) {
					broadcastStartlivenessMiner(blockNumber)
					return logger(Colors.red(`onMessage newBlock skip THE BLOCK [${blockNumber}] EVENT`))
				}
				// if (livenessStart) {
				// 	return logger(Colors.red(`onMessage newBlock but livenessStart === true, skip THE BLOCK [${blockNumber}] EVENT`))
				// }
				livenessStart = true
				const walletAddressArray = Array.from(livenessListeningPool, ([name, value]) => name)
				const final_walletAddressArray = walletAddressArray.filter(n => n !== undefined)

				logger(Colors.magenta(`newBlock [${blockNumber}] walletAddressArray = ${final_walletAddressArray?.length}`))
				broadcastStartlivenessMiner(blockNumber)
				return splitPei (final_walletAddressArray, masterSetup.cnptReferralAdmin, ReferralsMap, async (data: sendMiner) => {

					livenessStart = false
					// await getNodesBalance(node_si_pool, masterSetup.conetPointAdmin)
					logger(Colors.magenta(`newBlock splitPei callback success!`))
					
					mergePool(data)
					
					logger(Colors.magenta(`newBlock splitPei success! miner length = [${data.miner.payList.length}] referrals = [${data.referrals.payList.length}] pushed to sendMinerPool.length  [${ sendMinerPool.length }]`))
					
				})

				return
			}

			case 'livenessStart': {
				const obj: minerObj = message.data[0]
				let ipMatch = false
				let ipaddress=''
				const _obj = livenessListeningPool.get (obj.walletAddress)

				if (_obj ){
					message.err = 'has connecting'
					return fork.send(message)
			
				}
				
				const index = ReserveIPAddress.findIndex(n => n === obj.ipAddress)
				const whiteListIndex = debugWhiteList.findIndex(n => n === obj.ipAddress)
				if (index < 0) {
					livenessListeningPool.forEach(n => {
						if (n.ipAddress === obj.ipAddress) {
							ipMatch = true
							ipaddress = n.ipAddress
						}
					})
				}
				
				if (whiteListIndex < 0 && (ipMatch||index > -1)) {
					message.data=[ipaddress]
					message.err = 'different IP'
					return fork.send(message)
				}
				
				obj.fork = fork
				livenessListeningPool.set(obj.walletAddress, obj)
				message.data=[livenessListeningPool.size, free_Pei]
				logger(Colors.gray(`[${obj.walletAddress}:${obj.ipAddress}] added to livenessListeningPool total size is [${livenessListeningPool.size}]`))
				return fork.send(message)
			}

			case 'sendCONET': {
				
				const wallet = message.data[0]
				logger(`sendCONET from[${wallet}]`)
				sendCONET_Pool.push (wallet)
				return _sendCONET()
			}

			case 'stop-liveness': {
				const obj: minerObj = message.data[0]
				const walletAddress = obj.walletAddress
				const kk = livenessListeningPool.get (walletAddress)
				if (!kk) {
					return logger(Colors.grey(`Client [${obj.ipAddress}:${walletAddress}] does't in list!`))
				}
				
				livenessListeningPool.delete(walletAddress)
				logger(Colors.grey(`stop-liveness [${obj.walletAddress}]`))
				return sendStopToWork(kk)
			}

			case 'livenessLoseConnecting': {
				const walletAddress = message.data[0]
				const _obj = livenessListeningPool.get (walletAddress)
				if (!_obj) {
					return //logger (Colors.red(`onMessage [livenessLoseConnecting] WalletAddress [${walletAddress}] from work id = [${fork.id}] has not in livenessListeningPool, length = [${livenessListeningPool.size}]`))
				}
				livenessListeningPool.delete(walletAddress)
				return //logger (Colors.cyan(`onMessage [livenessLoseConnecting] WalletAddress [${walletAddress}] delete from livenessListeningPool SUCCESS! length = [${livenessListeningPool.values}]`))
			}

			case 'attackcheck': {
				const ipaddress:string = message.data[0]
				message.data = []
				const count = ipaddressPool.get(ipaddress)
				const time = new Date().getTime()
				if (!count) {
					ipaddressPool.set(ipaddress, [time])
					return fork.send(message)
				}
				
				count.push(time)
				
				
				if (count.length < 5) {
					return fork.send(message)
				}

				const checkTime = () => {
					if (count.length < 5) {
						return fork.send(message)
					}
					const tx = count.shift()
					if (tx === undefined) {
						checkTime ()
						return
					}

					if (time - tx < 5000 ) {
						message.data = [true]
						return fork.send(message)
					}
					return fork.send(message)
				}
				return checkTime()
			}

			case 'registerReferrer': {
				const obj = message.data[0]
				message.data = [await checkReferralSign(obj.walletAddress, obj.referrer, ReferralsMap, masterSetup.cnptReferralAdmin, nonceLock)]
				return fork.send(message)
			}

			case 'available-nodes': {
				return
			}

			default: {
				return logger (Colors.bgRed(`master get know message`), inspect (message, false, 3, true))
			}
		}
	}

	const forkWorker = () => {
		
		let numCPUs = cpus ().length
		
		debug ? logger (`Cluster.isPrimary node have ${ numCPUs } cpus\n`): null
	
		_forkWorker (onMessage)

	}

	if(!daemon) {
		logger (`main process start getSetupInfo!`)
		process.once ('exit', (code: any, kk: any) => {
		
			logger (Colors.red (`@conet.project/mvp-dl main process on EXIT with [code ${code}, kk ${kk}], restart again!\nstartCommand = ${startCommand}`))
			const uuu = exec (startCommand)
	
			uuu.once ('spawn', () => {
				return logger (Colors.red (`@conet.project/mvp-dl main process now to exit!, ${startCommand} Start!`))
			})
	
		})
		getSetupInfo ()
	} else {
		logger(`main process start daemon process`)
		
		_forkWorker ()
	}	

	

} else {
	if (!daemon) {
		const uuu = new conet_dl_server ()
		// process.on ('message', (message: clusterMessage) => uuu.onMessage (message))
	} else {
		daemons()
	}
	
}
