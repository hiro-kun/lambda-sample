'use strict';

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

const get_s3 = (params) => new Promise((resolve, reject) => {
    s3.getObject(params, (err, data) => {
        if (err) reject(err);

        resolve(data);
    });
});

const process = async(s3Event) => {
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

    const image_info = await get_s3(event_image_param);

    const image_resize_params = {
        buket_name: buket_name,
        output_file_name: output_file_name,
        base64_image: new Buffer(image_info.Body).toString('base64'),
        width: 500,
        height: 500
    };

    // 画像リサイズ
    const resize_file_param = await resize_image(image_resize_params)

    // 画像UP
    await put_s3(resize_file_param)
}

exports.handler = (event, context, callback) => {
    const s3Event = event.Records[0].s3;

    process(s3Event).then(() => {
        console.log('all finish.');
    }).catch((err) => {
        console.log("error");
        console.log(err);
        callback(err);
    });
};
