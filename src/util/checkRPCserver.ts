import {readFile} from 'node:fs'
import {exec} from 'node:child_process'
import { logger } from './logger'
import {inspect} from 'node:util'
import Colors from 'colors/safe'

const serverFIle = `cat /etc/nginx/sites-available/conet.conf|grep "[^#]server\ [^{]"`
const getAllServer = () => new Promise(resolve => {

	exec(serverFIle, (err, stdout) => {
		if (!stdout) {
			return resolve (false)
		}
		const servers: string[] = []
		const k = stdout.split('\n')
		k.forEach (n => {
			const ll = n.split('server ')[1]
			if (ll) {
				servers.push (ll.split(';')[0])
			}
		})
		return resolve (servers)
	})
})

const test = async () => {
	logger(inspect(await getAllServer(), false, 3, true))
}

test()