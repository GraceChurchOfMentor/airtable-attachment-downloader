require('dotenv').config()

const Airtable = require('airtable');
const Downloader = require("nodejs-file-downloader");
const cliProgress = require('cli-progress');
const c = require('ansi-colors');
const { exit } = require('process');

(async () => {
  const config = configure()
  const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    forceRedraw: true,
    barsize: 10,
    format: barFormatter,
  }, cliProgress.Presets.shades_grey)

  console.debug(
    c.magenta('Config:'),
    "\n  " + c.cyan('Attachments Directory: ') + c.white(config.attachmentsDir),
    "\n  " + c.cyan('Airtable Base ID: ') + c.white(config.baseId),
    "\n  " + c.cyan('Airtable Base Name: ') + c.white(config.baseName),
    "\n  " + c.cyan('Airtable View Name: ') + c.white(config.viewName),
    "\n",
  )
  const promises = []

  gatherRecords(config)
    .then(attachments => {
      console.log(c.magenta('Downloading...'))

      attachments.forEach((attachment, index, array) => {
        setTimeout(() => {
          const pb = multibar.create(100, 0, { filename: attachment.filename });

          promises.push(
            downloadAttachment(attachment.url, attachment.filename, config.attachmentsDir, pb)
              .then(() => {
                pb.update(100, { filename: attachment.filename })

                setTimeout(() => {
                  pb.stop()
                }, 200)
              })
          )

          if (index === array.length - 1) {
            Promise.all(promises)
              .then(() => {
                multibar.stop()
                console.log("\n", c.magenta('All done!'))
              })
          }

        }, config.downloadInterval * index)
      })
    })
})()

function configure() {
  const defaultConfig = {
    attachmentsDir: './attachments',
    downloadInterval: 500,
    pageSize: 100,
  }
  const config = {
    attachmentsDir: process.env.ATTACHMENTS_DIR,
    apiKey: process.env.AIRTABLE_API_KEY,
    baseId: process.env.AIRTABLE_BASE_ID,
    baseName: process.env.AIRTABLE_BASE_NAME,
    viewName: process.env.AIRTABLE_VIEW_NAME,
    attachmentFieldName: process.env.AIRTABLE_ATTACHMENT_FIELD_NAME,
    pageSize: parseInt(process.env.AIRTABLE_PAGE_SIZE),
    downloadInterval: parseInt(process.env.DOWNLOAD_INTERVAL)
  }

  return config
}

function gatherRecords(config) {
  return new Promise((resolve, reject) => {
    const output = []
    const base = new Airtable({
      apiKey: config.apiKey
    }).base(config.baseId)

    base(config.baseName).select({
      view: config.viewName,
      pageSize: config.pageSize,
    }).eachPage((records, fetchNextPage) => {
      console.log(c.magenta('Retrieving page...'))

      records.forEach(record => {
        const attachment = record.get(config.attachmentFieldName)[0];

        console.debug('  Retrieved record ' + c.white(record.id))

        output.push({
          filename: attachment.filename,
          url: attachment.url
        })
      })

      console.debug('')

      fetchNextPage()
    }, (err) => {
      if (err) {
        console.error(err)
        reject(err)
      }

      resolve(output)
    })
  })
}

function downloadAttachment(url, fileName, directory, pb) {
  const downloader = new Downloader({
    url,
    fileName,
    directory,
    cloneFiles: false,
    onProgress: (percentage, chunk, remainingSize) => {
      pb.update(percentage, { filename: fileName })
    },
  })
  try {
    return downloader.download()
    //Downloader.download() returns a promise.
  } catch (error) {
    //IMPORTANT: Handle a possible error. An error is thrown in case of network errors, or status codes of 400 and above.
    //Note that if the maxAttempts is set to higher than 1, the error is thrown only if all attempts fail.
    console.log("Download failed", error)
  }
}

function barFormatter(options, params, payload) {
  const percentString = Math.round(params.progress * 100) + ''
  const completeLength = Math.round(params.progress * options.barsize)
  const incompleteLength = options.barsize - completeLength
  const completeString = options.barCompleteString.substr(0, completeLength)
  const incompleteString = options.barIncompleteString.substr(0, incompleteLength)

  const bar = '  ' + c.green(completeString) + c.green(incompleteString)
  const filename = c.cyan(payload.filename)
  const separator = '  '
  const percent = (() => {
    if (params.value >= params.total) {
      return c.green(percentString.padStart(4, ' ') + '%')
    } else {
      return c.yellow(percentString.padStart(4, ' ') + '%')
    }
  })()

  return bar + percent + separator + filename
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
