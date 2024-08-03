import server from './newMiningMaster'
import { cpus } from 'node:os'
import v3Daemon from './newMiningDaemon'
import Cluster from 'node:cluster'
import Colors from 'colors/safe'
import { logger } from '../util/util'


if (Cluster.isPrimary) {
	const forkWorker = () => {
		
		let numCPUs = cpus().length

		for (let i = 0; i < numCPUs; i ++){
			_forkWorker()
		}
	}
	
	const _forkWorker = () => {
		const fork = Cluster.fork ()
		fork.once ('exit', (code: number, signal: string) => {
			logger (Colors.red(`Worker [${ fork.id }] Exit with code[${ code }] signal[${ signal }]!\n Restart after 30 seconds!`))
			
			return setTimeout (() => {
				return _forkWorker ()
			}, 1000 * 10 )
		})
		return (fork)
	}

	
	new v3Daemon ()
	
} else {
	setTimeout(() => {
		new server()
	}, 10000)
	
}
