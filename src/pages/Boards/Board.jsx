import Container from '@mui/material/Container'
import AppBar from '~/components/AppBar/AppBar'
import BoardBar from './BoardBar/BoardBar'
import BoadContent from './BoardContent/BoardContent'
function Board() {
  return (
    <Container disableGutters maxWidth={false} sx={{ height:'100vh', backgroundColor: 'primary.main' }}>
      <AppBar />
      <BoardBar />
      <BoadContent />
    </Container>
  )
}
export default Board
