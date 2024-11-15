import server from './serverApiV3'
import Cluster from 'node:cluster'
import { cpus } from 'node:os'
import {logger} from '../util/logger'
import Colors from 'colors/safe'
import masterServer from './serverApiV3Master'

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
	setTimeout (() => {
		forkWorker()
	}, 5000)
	
	new masterServer()
} else {
	new server()
}