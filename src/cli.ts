#!/usr/bin/env node
import Cluster from 'node:cluster'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { cpus } from 'node:os'


import { logger, getServerIPV4Address, GenerateWalletAddress, saveSetup, getSetup, waitKeyInput } from './util/util'
import server from './endpoint/server'

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
if ( Cluster.isPrimary ) {
	const packageFile = join (__dirname, '..', 'package.json')
	debug ? logger (`packageFile = ${ packageFile }`): null
	const setup = require (packageFile)
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
	
	let numCPUs = cpus ().length

	debug ? logger (`Cluster.isPrimary node have ${ numCPUs } cpus\n`): null

	numCPUs = 1							//			not support multi-cpus

	// for (let i = 0; i < numCPUs; i++) {
	// 	Cluster.fork()
	// }

	const getSetupInfo = async () => {
		// @ts-ignore: Unreachable code error
		let setupInfo: ICoNET_NodeSetup|undefined = await getSetup ( debug )

		if ( !setupInfo ) {
			
			// @ts-ignore: Unreachable code error
			const password = await waitKeyInput (`Please enter the password for protected wallet address: `, true )

			// @ts-ignore: Unreachable code error
			const port: number = parseInt(await waitKeyInput (`Please enter the node listening PORT number [default is 80]: `))|| 80

			const keychain = GenerateWalletAddress ( password )

			setupInfo = {
				keychain: keychain,
				ipV4: GlobalIpAddress[0],
				ipV6: '',
				ipV4Port: port,
				ipV6Port: port,
				setupPath: '',
				keyObj: null
			}
			// @ts-ignore: Unreachable code error
			await saveSetup ( setupInfo, debug )
			return new server( debug, setup.version, passwd )
		}
		
		debug ? logger (`getSetupInfo has data:\n`, inspect ( setupInfo, false, 4, true )): null
		return new server( debug, setup.version, passwd )
	}

	getSetupInfo ()
} else {
	
}
