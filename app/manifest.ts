import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '丘比特的婚礼考验',
    short_name: '婚礼任务',
    description: '仅限受邀宾客参与的婚礼秘密任务游戏',
    start_url: '/guest',
    display: 'standalone',
    background_color: '#f7f2ec',
    theme_color: '#765247',
    lang: 'zh-CN',
    orientation: 'portrait',
  };
}
