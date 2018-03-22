'use strict';

const im = require('imagemagick');
const fs = require('fs');
const aws = require('aws-sdk');
const path = require('path');
const s3 = new aws.S3({ apiVersion: '2006-03-01' });

const resize_image = (image_resize_params, context) => new Promise((resolve, reject) => {

    // Lambdaファンクションの動作環境での作業場所
    const dst_path = '/tmp/resized.';

    const im_params = {
      srcData: new Buffer(image_resize_params.base64_image, 'base64'),
      dstPath: dst_path,
      width: image_resize_params.width,
      height: image_resize_params.height
    };

    try {
        im.resize(im_params, (err, stdout, stderr) => {
            if (err) {
                throw err;
            } else {
                console.log('Resize operation completed successfully');

            const params = {
                Bucket: image_resize_params.buket_name,
                Key: image_resize_params.output_file_name,
                Body: new Buffer(fs.readFileSync(dst_path)),
                ContentType: 'image/jpeg'
            };

                resolve(params);
            }
        });
    } catch (err) {
        console.log('Resize operation failed:', err);
        context.fail(err);
    }
});

exports.handler = (event, context) => {

    // S3から渡ってくるバケットの名前の取得
    const baket_name = event.Records[0].s3.bucket.name;
    // 画像ファイル名取得
    const image_file_name = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    // _thumのついているファイルは処理しない(処理するとS3に無限にアップロードされる)
    if (image_file_name.lastIndexOf('_resize') != -1) {
        console.log('skip');
        return;
    }

    const file_name = path.parse(image_file_name).name;
    const file_ext = path.parse(image_file_name).ext;
    // 変換後ファイル名
    const output_file_name = file_name + '_resize' + file_ext;

    const params = {
        Bucket: baket_name,
        Key: image_file_name
    };

    // S3ファイル名取得
    s3.getObject(params, (err, data) => {
        const image_resize_params = {
            buket_name: baket_name,
            output_file_name: output_file_name,
            base64_image: new Buffer(data.Body).toString('base64'),
            width: 200,
            height: 200
        };
        resize_image(image_resize_params, context)
            .then((params) => {
              // S3にputする
              s3.putObject(params, (err, data) => {
                  console.log(err);
                  console.log(data);
                  resolve("success");
              });
            })
            .then((message) => {
                context.succeed();
            });
    });
};
