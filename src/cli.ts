#!/usr/bin/env node
import { join } from 'node:path'
import { inspect } from 'node:util'
import { logger, getServerIPV4Address, generateWalletAddress, saveSetup, getSetup, waitKeyInput, loadWalletAddress, s3fsPasswd } from './util/util'
import {streamCoNET_USDCPrice} from './endpoint/help-database'
import conet_dl_server from './endpoint/server'
import Cluster from 'node:cluster'
import Colors from 'colors/safe'
import { homedir, cpus } from 'node:os'

if ( Cluster.isPrimary) {
	const [,,...args] = process.argv
	let debug = false
	let version = false
	let start = false
	let help = false
	let passwd = ''

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
		const s3pass = await s3fsPasswd()
		if (!s3pass) {
			throw new Error (`Have no s3pass error!`)
		}
		const streamCoNET_USDCPriceQuere: any[] = []
		forkWorker ()
		streamCoNET_USDCPrice (streamCoNET_USDCPriceQuere)
	}

	const getSetupInfo = async () => {
		// @ts-ignore: Unreachable code error
		let setupInfo: ICoNET_NodeSetup|undefined = await getSetup ( debug )
	
		if ( !setupInfo ) {
			const DL_Path = '.CoNET-DL'
			const setupFileDir = join ( homedir(), DL_Path )
			const setupFileName = join ( setupFileDir, 'nodeSetup.json')

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
				keyObj: null
			}
			await saveSetup ( setupFileName, JSON.stringify (setupInfo))
			return tryMaster_json_file (password, setupInfo)
		} 
		return tryMaster_json_file ('', setupInfo)
		
	}

	const forkWorker = () => {
		
		let numCPUs = cpus ().length
		
		debug ? logger (`Cluster.isPrimary node have ${ numCPUs } cpus\n`): null
	
		const _forkWorker = () => {
			const fork = Cluster.fork ()
			fork.once ('exit', (code: number, signal: string) => {
				logger (Colors.red(`api-server.js Exit with code[${ code }] signal[${signal}]!\n Restart after 30 seconds!`))
				return setTimeout (() => {
					return _forkWorker ()
				}, 1000 * 10)
			})
		}
		
		for (let i = 0; i < numCPUs -1; i ++) {
			_forkWorker ()
		}
		
	}

	getSetupInfo ()
		
} else {
	new conet_dl_server ()
}
	
