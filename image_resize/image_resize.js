'use strict';

const im = require('imagemagick');
const fs = require('fs');
const aws = require('aws-sdk');
const path = require('path');

/**
 * S3-S3間での画像リサイズ
 *
 * @author ono-hiroshi
 * @since 2018-03-27
 */

const s3 = new aws.S3({ apiVersion: '2006-03-01' });

const resize_image = (image_resize_params) => new Promise((resolve, reject) => {

    // Lambdaファンクションの動作環境での作業場所
    const dst_path = '/tmp/' + image_resize_params.output_file_name;

    const im_params = {
        srcData: new Buffer(image_resize_params.base64_image, 'base64'),
        dstPath: dst_path,
        width: image_resize_params.width,
        height: image_resize_params.height
    };

    im.resize(im_params, (err, stdout, stderr) => {
        if (err) reject(err);

        console.log('Resize operation completed successfully');

        const resize_file_param = {
            Bucket: image_resize_params.buket_name,
            Key: image_resize_params.output_file_name,
            Body: new Buffer(fs.readFileSync(dst_path)),
            ContentType: 'image/jpeg'
        };

        resolve(resize_file_param);
    });
});

const put_s3 = (params) => new Promise((resolve, reject) => {
    s3.putObject(params, (err, data) => {
        if (err) reject(err);

        resolve();
  });
});

const process = (s3Event) => new Promise((resolve, reject) => {
    console.log('Lambda started.');

    // バケット名の取得
    const buket_name = s3Event.bucket.name;
    // 画像ファイル名取得
    const image_file_name = decodeURIComponent(s3Event.object.key.replace(/\+/g, ' '));

    // _resizeのついているファイルは処理しない(処理するとS3に無限にアップロードされる)
    if (image_file_name.lastIndexOf('_resize') != -1) {
        console.log('skip');
        return;
    }

    const file_name = path.parse(image_file_name).name;
    const file_ext = path.parse(image_file_name).ext;
    // 変換後ファイル名
    const output_file_name = file_name + '_resize' + file_ext;

    const event_image_param = {
        Bucket: buket_name,
        Key: image_file_name
    };

    // S3ファイル名取得
    s3.getObject(event_image_param, (err, data) => {

        if (err) return callback(err);

        const image_resize_params = {
            buket_name: buket_name,
            output_file_name: output_file_name,
            base64_image: new Buffer(data.Body).toString('base64'),
            width: 500,
            height: 500
        };

        resize_image(image_resize_params).then((resize_file_param) => {
            put_s3(resize_file_param).then((res) => {
                console.log('Image resize finish.');
            }).catch((err) => {
                console.log(err);
                console.log("Put image error.");
            });
        }).catch((err) => {
            console.log(err);
            console.log("Image resize error.");
        });
    });
});

exports.handler = (event, context, callback) => {
    const s3Event = event.Records[0].s3;

    process(s3Event).then(() => {
       console.log('all finish.');
       callback(null, res);
    }).catch((err) => {
       console.log(err);
       callback(err);
    });
};
