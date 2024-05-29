// "use strict";
// Object.defineProperty(exports, "__esModule", { value: true });
// const help_database_1 = require("./help-database");
// const [, , ...args] = process.argv;
// const check = async () => {
//     console.log(await (0, help_database_1.checkIpAddress)(args[0]));
// };
// check();


import {checkIpAddress} from './help-database'
import {readFile} from 'node:fs'
import { logger } from '../util/logger'
import Colors from 'colors/safe'
import {exec} from 'node:child_process'
import { mapLimit} from 'async'

const iptablesIp = (ipaddress: string) => {
	const cmd = `sudo iptables -I INPUT -s ${ipaddress} -j DROP`
	exec (cmd, err => {
		if (err) {
			logger(Colors.red(`iptablesIp Error ${err.message}`))
		}
	})
}


const startFilter = () => {
	const addressM: Map<string, number> = new Map()
	return readFile('kk', (err, data) => {
		if (err) {
			return logger(`startFilter error!`)
		}
		const kk = data.toString()
		const ll = kk.split('\n')
		
		logger(Colors.red(`IP address Length [${ll.length}]`))
		mapLimit(ll, 3, async (n, index) => {
			const ipaddress = n.split(' ')[0]
			const kk = await checkIpAddress(ipaddress)
			if (!kk||kk<1) {
				const kkk = addressM.get(ipaddress)
				if (kkk) {
					logger(Colors.red(`added ipaddress [${ipaddress}] to Filter`))
					return iptablesIp (ipaddress)
				} else {
					addressM.set(ipaddress, 1)
				}
			}
		}, err => {
			logger(Colors.blue (`startFilter success!`))
		})
		
		
	})
}

startFilter()