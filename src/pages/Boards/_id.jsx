import { useEffect, useState } from 'react'
import Container from '@mui/material/Container'
import AppBar from '~/components/AppBar/AppBar'
import BoardBar from './BoardBar/BoardBar'
import BoadContent from './BoardContent/BoardContent'
import { mockData } from '~/apis/mock-data'
import { fetchBoardDetailsAPI } from '~/apis'


function Board() {
  const [board, setBoard] = useState(null)

  useEffect(() => { //tạm thời fix cứng boardId, flow chuẩn chỉnh thì sẽ sử dụng react-router-dom để lấy chuẩn từ boardId từ URL về
    const boardId = '65a2a00035ee6d59811838ba'
    //call API
    fetchBoardDetailsAPI(boardId).then(board => {
      setBoard(board)
    })
  }, [])

  return (
    <Container disableGutters maxWidth={false} sx={{ height: '100vh' }}>
      <AppBar />
      <BoardBar board={board} />
      <BoadContent board={board} />
    </Container>
  )
}
export default Board
