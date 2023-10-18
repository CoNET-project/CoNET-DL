#!/usr/bin/env node
import { join } from 'node:path'
import { inspect } from 'node:util'
import { exec } from 'node:child_process'
import { logger, getServerIPV4Address, generateWalletAddress, saveSetup, getSetup, waitKeyInput, loadWalletAddress, startPackageSelfVersionCheckAndUpgrade, generatePgpKeyInit } from './util/util'
import {streamCoNET_USDCPrice} from './endpoint/help-database'
import conet_dl_server from './endpoint/server'
import Cluster from 'node:cluster'
import type { Worker } from 'node:cluster'
import Colors from 'colors/safe'
import { homedir, cpus } from 'node:os'

const eraseNodeOnlieTime = 1000 * 60 * 6

if ( Cluster.isPrimary) {
	const DL_Path = '.CoNET-DL'
	const setupFileDir = join ( homedir(), DL_Path )
	const setupFileName = join ( setupFileDir, 'nodeSetup.json')
	
	const startCommand = `conet-mvp-dl -d start > system.log &`

	process.once ('exit', () => {
		
		logger (Colors.red (`@conet.project/mvp-dl main process on EXIT, restart again!\nstartCommand = ${startCommand}`))
		const uuu = exec (startCommand)

		uuu.once ('spawn', () => {
			return logger (Colors.red (`@conet.project/mvp-dl main process now to exit!, ${startCommand} Start!`))
		})

	})

	const [,,...args] = process.argv
	let debug = false
	let version = false
	let start = false
	let help = false
	let passwd = ''
	let workerPool: Worker[] = []
	let single = false
	let node_si_pool: any[] = []
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

	args.forEach ((n, index ) => {
		if (/\-d/.test(n)) {
			debug = true
		} else if ( /\-v| \--version/.test (n)) {
			version = true
		} else if  (/\-start/.test (n)) {
			start = true
		} else if (/\-h|\--help/.test (n)) {
			help = true
		} else if (/\-p/.test(n)) {
			passwd = args[index + 1]
		}
		else if (/\-s/.test(n)) {
			single = true
		}
	})

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
	}
	
	if ( !args[0] || help ) {
		printInfo ()
	}
	
	const GlobalIpAddress = getServerIPV4Address ( false )
	
	debug? logger (inspect (GlobalIpAddress, false, 3, true )) : null
	
	if ( GlobalIpAddress.length === 0 ) {
		logger ('WARING: Your node looks have no Global IP address!')
	}
	const startPackageSelfVersionCheckAndUpgrade_IntervalTime = 1000 * 60 * 10				//			10 mins

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


	const tryMaster_json_file = async (password: string, setupInfo: ICoNET_NodeSetup) => {
		const setup = join( homedir(),'.master.json' )
		const masterSetup: ICoNET_DL_masterSetup = require ( setup )
		
		if (! masterSetup.passwd ) {
			password = await waitKeyInput (`Please enter the password for protected wallet address: `, true )
		}

		if ( password ) {
			masterSetup.passwd = password
			await saveSetup ( setup, JSON.stringify (masterSetup))
		}
		const obj = loadWalletAddress (setupInfo.keychain, masterSetup.passwd )

		const streamCoNET_USDCPriceQuere: any[] = []
		if (!setupInfo.pgpKeyObj) {
			setupInfo.pgpKeyObj = await generatePgpKeyInit ( setupInfo.keychain[0].address, password )

			await saveSetup ( setupFileName, JSON.stringify (setupInfo))
		}

		single ? new conet_dl_server () : forkWorker ()
		streamCoNET_USDCPrice (streamCoNET_USDCPriceQuere)
		return checkNewVer()

	}

	const getSetupInfo = async () => {
		// @ts-ignore: Unreachable code error
		let setupInfo: ICoNET_NodeSetup|undefined = await getSetup ( debug )
	
		if ( !setupInfo ) {

			const password = await waitKeyInput (`Please enter the password for protected wallet address: `, true )
	
			// @ts-ignore: Unreachable code error
			const port: number = parseInt(await waitKeyInput (`Please enter the node listening PORT number [default is 443]: `))|| 443
	
			const keychain = generateWalletAddress ( password )

			setupInfo = {
				keychain: keychain,
				ipV4: GlobalIpAddress[0],
				ipV6: '',
				ipV4Port: port,
				ipV6Port: port,
				setupPath: '',
				pgpKeyObj: await generatePgpKeyInit(keychain[0].address, password),
				keyObj: null
			}

			await saveSetup ( setupFileName, JSON.stringify (setupInfo))
			return tryMaster_json_file (password, setupInfo)
		} 
		return tryMaster_json_file ('', setupInfo)
		
	}

	const broadcastNodelistToAllWorkers = () => {
		const mess: clusterMessage = {
			cmd: 'si-node',
			data: [node_si_pool]
		}
		
		return workerPool.forEach (v => {
			if ( v.isConnected()) {
				v.send (mess)
			}
		})
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
				node_si_pool.splice (index, 1)
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

	const onMessage = (message: clusterMessage) => {
		switch (message.cmd) {
			case 'si-node': {
				return addToSiPool (message.data[0])
			}

			default: {
				return logger (Colors.bgRed(`master get know message`), inspect (message, false, 3, true))
			}
		}
	}

	const forkWorker = () => {
		
		let numCPUs = cpus ().length * 2
		
		debug ? logger (`Cluster.isPrimary node have ${ numCPUs } cpus\n`): null
	
		const _forkWorker = () => {
			const fork = Cluster.fork ()

			fork.on ('message', onMessage )

			fork.once ('exit', (code: number, signal: string) => {
				logger (Colors.red(`Worker [${ fork.id }] Exit with code[${ code }] signal[${ signal }]!\n Restart after 30 seconds!`))
				if ( !signal) {
					return logger (`Worker [${ fork.id }] signal = NEW_VERSION do not restart!`)
				}

				return setTimeout (() => {
					return _forkWorker ()
				}, 1000 * 10)
			})
			return (fork)
		}
		
		for (let i = 0; i < numCPUs; i ++) {
			const woeker = _forkWorker ()
			workerPool.push (woeker)
		}
		
	}

	getSetupInfo ()
		
} else {
	const uuu = new conet_dl_server ()
	process.on ('message', (message: clusterMessage) => uuu.onMessage (message))
}
	
