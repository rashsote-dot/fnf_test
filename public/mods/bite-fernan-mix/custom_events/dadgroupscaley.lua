function onEvent(name, value1, value2)
	if name == 'DadGroupScaleY' then
		doTweenY('DadGroupScaleY', 'dadGroup.scale', value1, value2, 'SineOut')
	end
end