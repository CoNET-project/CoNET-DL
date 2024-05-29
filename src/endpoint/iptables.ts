// "use strict";
// Object.defineProperty(exports, "__esModule", { value: true });
// const help_database_1 = require("./help-database");
// const [, , ...args] = process.argv;
// const check = async () => {
//     console.log(await (0, help_database_1.checkIpAddress)(args[0]));
// };
// check();



import {readFile} from 'node:fs'
import { logger } from '../util/logger'
import Colors from 'colors/safe'
import {exec} from 'node:child_process'
import { mapLimit} from 'async'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'

const setup = join( homedir(),'.master.json' )
import { Client, auth, types } from 'cassandra-driver'
import type { TLSSocketOptions } from 'node:tls'


const iptablesIp = (ipaddress: string) => {
	const cmd = `sudo iptables -I INPUT -s ${ipaddress} -j DROP`
	exec (cmd, err => {
		if (err) {
			return logger(Colors.red(`iptablesIp Error ${err.message}`))
		}
		logger(Colors.red(`iptablesIp added ${ipaddress}`),'\n')
	})
}

const masterSetup: ICoNET_DL_masterSetup = require ( setup )

const sslOptions: TLSSocketOptions = {
	key : masterSetup.Cassandra.certificate.key,
	cert : masterSetup.Cassandra.certificate.cert,
	ca : masterSetup.Cassandra.certificate.ca,
	rejectUnauthorized: masterSetup.Cassandra.certificate.rejectUnauthorized
}
const option = {
	contactPoints : masterSetup.Cassandra.databaseEndPoints,
	localDataCenter: 'dc1',
	authProvider: new auth.PlainTextAuthProvider ( masterSetup.Cassandra.auth.username, masterSetup.Cassandra.auth.password ),
	sslOptions: sslOptions,
	keyspace: masterSetup.Cassandra.keyspace,
	protocolOptions: { maxVersion: types.protocolVersion.v4 }
}

const checkIpAddress = async (cassClient: Client, ipaddress: string) => {
	
	const cmd = `SELECT ipaddress from conet_free_mining WHERE ipaddress = '${ipaddress}'`
	try {
		const jj = await cassClient.execute (cmd)
		
		return (jj.rowLength)
	} catch (ex) {
		
		return null
	}
	
}

const startFilter = () => {
	const addressM: Map<string, number> = new Map()
	return readFile('kk', (err, data) => {
		if (err) {
			return logger(`startFilter error!`)
		}
		const kk = data.toString()
		const ll = kk.split('\n')
		const cassClient = new Client (option)
		logger(Colors.red(`IP address Length [${ll.length}]`))
		mapLimit(ll, 5, async (n, index) => {
			const ipaddress = n.split(' ')[0]
			const kk = await checkIpAddress(cassClient, ipaddress)
			if (!kk||kk<1) {
				const kkk = addressM.get(ipaddress)
				if (kkk) {
					
					return iptablesIp (ipaddress)
				} else {
					addressM.set(ipaddress, 1)
				}
			}
		}, async err => {
			await cassClient.shutdown()
			logger(Colors.blue (`startFilter success!`))
		})
		
		
	})
}

startFilter()