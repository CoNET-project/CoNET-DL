import {readFile} from 'node:fs'
import { logger } from '../util/logger'
import Colors from 'colors/safe'
import { mapLimit} from 'async'
import {inspect} from 'node:util'

import {exec} from 'node:child_process'


const iptablesIp = (ipaddress: string) => new Promise(resolve => {
	const cmd = `sudo iptables -I INPUT -s ${ipaddress} -j DROP`
	exec (cmd, async err => {
		if (err) {

			logger(Colors.red(`iptablesIp Error ${err.message}`))
			resolve(await iptablesIp(ipaddress))
		}
		logger(Colors.red(`iptablesIp added ${ipaddress}`))
		resolve (true)
	})
})
	


interface dataK {
	ipaddress: string
	times: number
}


const limit = 15

const addressMap : Map<string, number> = new Map()
const startFilter = () => {
	logger(Colors.blue(`start filter!`))
	exec('sudo tail -n 10000 /var/log/nginx/access.log|grep \ HTTP\/1\.1\"\ 400\ 0\ > kk', () => {
		logger(Colors.blue(`sudo tail -n 10000 /var/log/nginx/error.log success`))
		return readFile('kk', (err, data) => {
			if (err) {
				return logger(`startFilter error!`)
			}
			const kk = data.toString()
			const ll = kk.split('\n')
			
			const kPool: Map<string, number> = new Map()
			ll.forEach(n => {
				const _ipaddress = n.split(' by zone "one", client: ')[1]
				if (_ipaddress) {
					const ipaddress = _ipaddress.split(', server: ')[0]
					const passed: number = kPool.get(ipaddress)||0
					kPool.set(ipaddress, passed+1)
				}
				
				// if (ipaddress.length) {
				// 	iptablesIp(ipaddress)

				// }
				
				
			})
			const kkPool: dataK[] = []
			kPool.forEach((n, key) => {
				kkPool.push({ipaddress: key, times: n})
			})
			
			kkPool.sort((a,b) => b.times - a.times)
			const finalPool = kkPool.filter(n => n.times > limit)
			logger(Colors.blue(`lengs = ${ll.length} kPool length = [${kPool.size}] finalPool time > [${limit}]  length ${finalPool.length}`))
			logger(inspect(finalPool.map(n => n.ipaddress), false, 3, true))
			mapLimit(finalPool, 1, async (n: dataK, next: any) => {
				const kk = addressMap.get(n.ipaddress)
				if (kk === undefined) {
					await iptablesIp(n.ipaddress)
					addressMap.set(n.ipaddress, n.times)
				}
				
			}, err => {
				setTimeout(() => {

					startFilter ()
	
				}, 2000)
			})
			

		})
	})
	
}

startFilter()