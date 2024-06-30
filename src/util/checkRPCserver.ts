import {readFile} from 'node:fs'
import {exec} from 'node:child_process'
import { logger } from './logger'
import {inspect} from 'node:util'
import Colors from 'colors/safe'
import type { RequestOptions, ServerResponse } from 'node:http'
import {request} from 'node:http'
import P from 'phin'

const serverFIle = `cat /etc/nginx/sites-available/conet.conf|grep "[^#]server\ [^{]"`

const tryConnect = async (host: string) => new Promise(resolve => {
	
	const option: RequestOptions = {
		host: host,
		path: '/',
		port: 80,
		method: 'GET',
		protocol: 'http:'
	}

	const req = request (option, res => {
		clearTimeout(timeout)

		if (res.statusCode === 200) {
			logger(Colors.blue(`host [${host}] success!`))
			return resolve (true)
		}
		logger(Colors.red(`host [${host}] response [${res.statusCode}] Error!`))
		return resolve(false)
		
	})

	req.once('error', (e) => {
		logger(Colors.red(`host [${host}] response on Error! Error!`), e)
		resolve(false)
	})

	const timeout = setTimeout(() => {
		logger(Colors.red(`host ${host} Timeout Error!`))
	}, 1000)

	req.end()
})

const getAllServer: () => Promise<string[]> = () => new Promise(resolve => {

	exec(serverFIle, (err, stdout) => {
		if (!stdout) {
			return resolve ([])
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
	const servers: string[] = await getAllServer()
	if (!servers) {
		return logger(Colors.red(`can't get all server!`))
	}
	logger(Colors.magenta(`start testing, total server is [${servers.length}]`))
	const execProcess = []
	servers.forEach(n => {
		execProcess.push (tryConnect(n))
	})
	
	await Promise.all ([
		...servers
	])
}

test()

