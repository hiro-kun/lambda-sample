

const im = require('imagemagick');
const fs = require('fs');
const aws = require('aws-sdk');
const path = require('path');

/**
 * S3-S3間での画像リサイズ
 * ※local環境で実行する場合はimagemagickをインストールする事
 *
 * @author ono-hiroshi
 * @since 2018-04-05
 */

const s3 = new aws.S3({ apiVersion: '2006-03-01' });

const resizeImage = imageResizeParams => new Promise((resolve, reject) => {
    // Lambdaファンクションの動作環境での作業場所
    const dstPath = `/tmp/${imageResizeParams.outputFileName}`;

    const imParams = {
        srcData: new Buffer(imageResizeParams.base64Image, 'base64'),
        dstPath: dstPath,
        width: imageResizeParams.width,
        height: imageResizeParams.height,
    };

    im.resize(imParams, (err, stdout, stderr) => {
        if (err) reject(err);

        console.log('Resize operation completed successfully');

        const resizeFileParam = {
            Bucket: imageResizeParams.buketName,
            Key: imageResizeParams.outputFileName,
            Body: new Buffer(fs.readFileSync(dstPath)),
            ContentType: 'image/jpeg',
        };

        resolve(resizeFileParam);
    });
});

const putS3 = params => new Promise((resolve, reject) => {
    s3.putObject(params, (err, data) => {
        if (err) reject(err);

        resolve();
    });
});

const getS3 = params => new Promise((resolve, reject) => {
    s3.getObject(params, (err, data) => {
        if (err) reject(err);

        resolve(data);
    });
});

const process = async (s3Event) => {
    console.log('Lambda started.');

    // バケット名の取得
    const buketName = s3Event.bucket.name;
    // 画像ファイル名取得
    const imageFileName = decodeURIComponent(s3Event.object.key.replace(/\+/g, ' '));

    // _resizeのついているファイルは処理しない(処理するとS3に無限にアップロードされる)
    if (imageFileName.lastIndexOf('_resize') != -1) {
        console.log('skip');
        return;
    }

    const fileName = path.parse(imageFileName).name;
    const fileExt = path.parse(imageFileName).ext;
    // 変換後ファイル名
    const outputFileName = `${fileName}_resize${fileExt}`;

    const eventImageParam = {
        Bucket: buketName,
        Key: imageFileName,
    };

    const imageInfo = await getS3(eventImageParam);

    const imageResizeParams = {
        buketName,
        outputFileName,
        base64Image: new Buffer(imageInfo.Body).toString('base64'),
        width: 500,
        height: 500,
    };

    // 画像リサイズ
    const resizeFileParam = await resizeImage(imageResizeParams);

    // 画像UP
    await putS3(resizeFileParam);
};

exports.handler = (event, context, callback) => {
    const s3Event = event.Records[0].s3;

    process(s3Event).then(() => {
        console.log('all finish.');
    }).catch((err) => {
        console.log('error');
        console.log(err);
        callback(err);
    });
};
