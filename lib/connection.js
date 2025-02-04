const Serialport = require('serialport')

class Connection {
  constructor (portName, options) {
    this.options = options || {}
    this.options.autoOpen = true
    this.state = Connection.states().INIT
    this.port = null
    return new Promise((resolve, reject) => {
      this.port = new Serialport(portName, options, err => {
        if (err) {
          this.state = Connection.states().ERROR
          reject(new Error(err))
        } else {
          this.state = Connection.states().OPEN
          resolve(this)
        }
      })
      this.port.on('error', () => {
        this.state = Connection.states().ERROR
      })
      this.port.on('close', () => {
        this.state = Connection.states().CLOSED
      })
    })
  }

  close () {
    return new Promise((resolve, reject) => {
      if (this && this.port) {
        this.port.close(err => {
          if (err) {
            this.state = Connection.states().ERROR
            reject(new Error(err))
          } else {
            this.state = Connection.states().CLOSED
            resolve(this)
          }
        })
      } else {
        reject(Error('not initialized yet'))
      }
    })
  }

  send (content, opts) {
    if (this.state !== Connection.states().OPEN) {
      return Promise.reject(new Error('instance not in state OPEN'))
    } else if (typeof content !== 'string' && !Buffer.isBuffer(content)) {
      return Promise.reject(
        new Error('first argument must be a string or a Buffer')
      )
    }
    opts = opts || {}
    const terminator = opts.terminator || ''
    const timeoutInit = opts.timeoutInit || 100
    const timeoutRolling = opts.timeoutRolling || 10
    const fixedRespBytesLength = opts.fixedRespBytesLength || -1

    this.state = Connection.states().INUSE
    let chunks = ''
    const bytes = []
    let timer

    return new Promise((resolve, reject) => {
      this.port.on('data', data => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        chunks = chunks.concat(data)
        bytes.push(data.toString('hex').toUpperCase())
        if (terminator) {
          const ix = chunks.indexOf(terminator)
          if (
            bytes.length >= fixedRespBytesLength ||
            (ix > 0 && ix === chunks.length + 1)
          ) {
            this.state = Connection.states().OPEN
            resolve(fixedRespBytesLength > 0 ? bytes.join('') : chunks)
          } else if (ix > 0 && ix !== chunks.length + 1) {
            this.state = Connection.states().ERROR
            reject(new Error('Terminator detected in the middle of answer. Check your options'))
            this.close()
          }
        }
        timer = setTimeout(() => {
          resolve(fixedRespBytesLength > 0 ? bytes.join('') : chunks)
        }, timeoutRolling)
      })

      this.port.write(content, err => {
        if (err) {
          reject(new Error(err))
        }
        timer = setTimeout(() => {
          resolve(fixedRespBytesLength > 0 ? bytes.join('') : chunks)
        }, timeoutInit)
      })
    })
  }

  getState () {
    return this.state
  }

  static states () {
    return {
      INIT: 'INIT',
      ERROR: 'ERROR',
      OPEN: 'OPEN',
      CLOSED: 'CLOSED',
      INUSE: 'IN_USE'
    }
  }
}

module.exports = Connection
