import {readFile} from 'node:fs'
import { logger } from '../util/logger'
import Colors from 'colors/safe'

import {exec} from 'node:child_process'


const iptablesIp = (ipaddress: string) => {
	const cmd = `sudo iptables -I INPUT -s ${ipaddress} -j DROP`
	exec (cmd, err => {
		if (err) {
			return logger(Colors.red(`iptablesIp Error ${err.message}`))
		}
		logger(Colors.red(`iptablesIp added ${ipaddress}`),'\n')
	})
}


const startFilter = () => {
	return readFile('kk', (err, data) => {
		if (err) {
			return logger(`startFilter error!`)
		}
		const kk = data.toString()
		const ll = kk.split('\n')
		
		logger(Colors.red(`IP address Length [${ll.length}]`))
		ll.forEach(n => {
			const ipaddress = n.split(' ')[0]
			if (ipaddress.length) {
				iptablesIp(ipaddress)
				
			}
			
			
		})
		
	})
}

startFilter()