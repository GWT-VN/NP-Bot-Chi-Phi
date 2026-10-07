#!/bin/zsh
# Đọc màn hình tmux (stdin), in SỐ của lựa chọn "I am using this for local development" trong hộp cảnh báo dev-channel của
# Claude Code; không thấy hộp thì không in gì. Chỉ nhận DÒNG LỰA CHỌN có số thứ tự ("❯ 1. I am using …") — cụm chữ đó nằm
# trong tin Zalo / câu trả lời thì không tính, và thứ tự lựa chọn đổi thì vẫn bấm đúng số (review M2, 2026-10-07).
dong=$(grep -m1 -E '^[^A-Za-z0-9]*[0-9]+\. +I am using this for local development')
[[ -z $dong ]] && exit 0
print -r -- "$dong" | grep -oE '[0-9]+' | head -1
